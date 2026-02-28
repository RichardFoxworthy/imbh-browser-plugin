# Crowdsourced Self-Healing Adaptor System

## The Problem

Adaptor selectors are hardcoded in TypeScript classes and break when insurers change their forms. Maintaining them requires developer intervention — a manual, slow, and unscalable process.

## The Solution

A **crowdsourced, self-healing navigation system** where:

1. The plugin auto-navigates users through known form steps
2. When it encounters unknown or changed pages, it prompts users to navigate manually
3. Every manual navigation is recorded (selectors and structure only — never user data)
4. Recordings are contributed to a central service
5. The central service merges contributions and distributes updated adaptors to all users

Every user interaction makes the system smarter for the next user.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Plugin                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Automation   │  │ Interaction  │  │  Assist-Mode  │ │
│  │   Engine      │◄─┤  Recorder    │◄─┤   Overlay UI  │ │
│  │  (auto mode)  │  │  (captures)  │  │  (user prompt)│ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘ │
│         │                  │                             │
│  ┌──────┴──────────────────┴───────┐                    │
│  │       Adaptor Sync Client       │                    │
│  │  (fetch latest, submit contribs)│                    │
│  └──────────────┬──────────────────┘                    │
│  ┌──────────────┴──────────────────┐                    │
│  │     Local Adaptor Cache         │                    │
│  │        (IndexedDB)              │                    │
│  └─────────────────────────────────┘                    │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
┌───────────────────────┴─────────────────────────────────┐
│                 Central Adaptor API                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Adaptor     │  │ Contribution │  │  Admin        │  │
│  │   Registry    │  │  Processor   │  │  Dashboard    │  │
│  │  (versioned)  │  │ (merge/score)│  │  (review)     │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              PostgreSQL / Supabase                   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## How Auto/Assist Mode Works

```
START → Load adaptor steps for this provider
  │
  ├─ STEP KNOWN? (waitForSelector matches)
  │   ├─ YES → AUTO MODE: fill fields, click next
  │   │         └─ Field fill failed? → Record failure, try fallbacks
  │   │             └─ All fallbacks failed? → Mark field as "needs update"
  │   │
  │   └─ NO → ASSIST MODE:
  │            1. Show overlay: "We need your help navigating this section"
  │            2. Start recording user interactions
  │            3. User fills form manually and clicks next
  │            4. Capture: selectors, field types, labels, button selectors, URL
  │            5. Submit contribution to central service
  │            6. Resume with next known step
  │
  ├─ NEW PAGE DETECTED? (URL changed, no matching step)
  │   └─ ASSIST MODE (as above)
  │
  └─ QUOTE PAGE? → Extract quote → DONE
```

## Data Model: JSON Adaptors

Adaptors are now **data documents**, not TypeScript classes:

```typescript
interface AdaptorDefinition {
  id: string;                    // e.g. 'budget-direct-home'
  version: number;               // incremented on each change
  provider: string;
  productType: ProductType;
  logoUrl: string;
  startUrl: string;
  enabled: boolean;
  updatedAt: string;             // ISO timestamp

  steps: AdaptorStep[];
  extractionRules: ExtractionRules;
}

interface AdaptorStep {
  id: string;                    // stable step identifier
  name: string;
  urlPattern?: string;           // regex for expected URL at this step
  waitForSelector: string;
  fallbackWaitSelectors: string[];
  fields: FieldMapping[];        // existing FieldMapping type
  nextAction: ActionMapping;
  timeout: number;

  // Crowdsource metadata
  confidence: number;            // 0-1, based on user verifications
  lastVerified: string;          // ISO timestamp
  contributorCount: number;      // how many users confirmed this step
  failureCount: number;          // recent failures (decays over time)
}

interface ExtractionRules {
  premiumSelectors: string[];
  excessSelectors: string[];
  inclusionSelectors: string[];
  confidence: number;
  lastVerified: string;
}
```

## Data Model: Contributions

What gets sent to the central service (never contains user PII):

```typescript
interface StepContribution {
  adaptorId: string;
  stepId?: string;              // null if this is a newly discovered step
  type: 'verification' | 'update' | 'new_step' | 'failure_report';
  timestamp: string;
  pluginVersion: string;

  // Page context (no PII)
  pageUrl: string;              // URL pattern (domain + path, no query params)
  pageTitle: string;

  // Discovered fields
  fields: DiscoveredField[];

  // Navigation
  nextButton?: {
    selector: string;
    text: string;
  };

  // What the user saw
  screenshot?: string;          // optional, low-res, user-consented
}

interface DiscoveredField {
  selector: string;
  tagName: string;
  inputType: string;            // text, select, radio, checkbox, etc.
  name: string;                 // input name attribute
  label: string;                // associated label text
  placeholder: string;
  ariaLabel: string;
  options?: string[];           // for select/radio: option labels
  suggestedProfilePath?: string; // our best guess at which profile field this maps to
}
```

## Privacy Guarantees

The interaction recorder NEVER captures:
- Actual values typed by the user
- Personal information (names, addresses, DOBs, etc.)
- Cookies, tokens, or session data
- Full URLs with query parameters (only domain + path pattern)

It ONLY captures:
- CSS selectors of form fields
- Field types and attributes (name, label, placeholder)
- Button selectors and text
- Page structure (which fields appear on which step)
- URL path patterns

## Contribution Confidence Scoring

```
confidence = verified_count / (verified_count + failure_count + age_decay)
```

- Each successful automation run = +1 verification
- Each failure to find a selector = +1 failure
- Age decay: confidence reduces by 0.01/day since last verification
- Threshold: steps below 0.3 confidence are flagged for assist mode
- Steps below 0.1 are marked as broken

## Sync Protocol

### On Extension Startup
1. Check `GET /adaptors/versions` → returns `{adaptorId: version}` map
2. Compare with locally cached versions
3. Fetch only changed adaptors: `GET /adaptors/:id`
4. Cache in IndexedDB

### During Quote Run
1. Load adaptor from local cache
2. Execute steps in auto mode
3. On success: queue a `verification` contribution
4. On failure: switch to assist mode, queue a `failure_report` + `update`/`new_step`

### Contribution Submission
1. Contributions queued in IndexedDB
2. Submitted in batch: `POST /adaptors/contributions` (max every 30s)
3. Retry with exponential backoff on failure
4. Contributions are anonymous (no user ID required)

## Central API Endpoints

```
GET  /api/adaptors                    → list all adaptor metadata
GET  /api/adaptors/versions           → {id: version} map for sync
GET  /api/adaptors/:id                → full adaptor definition
POST /api/adaptors/:id/contributions  → submit step contributions
GET  /api/adaptors/:id/health         → aggregated health status
```

## File Structure (New/Modified)

```
src/
├── adaptors/                          # renamed from adapters/
│   ├── types.ts                       # updated with new types
│   ├── adaptor-definition.ts          # JSON adaptor runtime wrapper
│   ├── adaptor-cache.ts               # IndexedDB cache for adaptors
│   ├── adaptor-sync.ts                # fetch/push to central API
│   └── seed/                          # bundled seed adaptors (offline fallback)
│       ├── budget-direct-home.json
│       ├── nrma-home.json
│       └── ...
│
├── content/
│   ├── automation-engine.ts           # MODIFIED: auto/assist hybrid
│   ├── interaction-recorder.ts        # NEW: captures user interactions
│   ├── assist-overlay.ts              # NEW: floating assist UI
│   └── ...
│
├── shared/
│   └── contribution-types.ts          # NEW: contribution data types
│
└── api/                               # NEW: central service (separate deploy)
    ├── server.ts
    ├── routes/
    │   ├── adaptors.ts
    │   └── contributions.ts
    ├── services/
    │   ├── contribution-processor.ts
    │   └── confidence-scorer.ts
    └── db/
        └── schema.sql
```

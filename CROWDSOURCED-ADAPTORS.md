# Crowdsourced Self-Healing Adaptor System

## The Problem

Adaptor selectors are hardcoded in TypeScript classes and break when insurers change their forms. Maintaining them requires developer intervention — a manual, slow, and unscalable process.

## The Solution

A **crowdsourced, self-healing navigation system** where:

1. **Any user can add a new insurer** — just provide a URL and the plugin enters discovery mode
2. The plugin auto-navigates users through known form steps
3. When it encounters unknown or changed pages, it prompts users to navigate manually
4. Every manual navigation is recorded (selectors and structure only — never user data)
5. Recordings are contributed to a central service
6. The central service merges contributions and distributes updated adaptors to all users

Every user interaction makes the system smarter for the next user.

## Zero-Knowledge Bootstrap

The system can begin with **zero knowledge** of any insurer form. No developer needs to
write a single selector. The entire adaptor is crowdsourced:

```
USER A: "I want to add Suncorp"
  → Provides URL: https://www.suncorp.com.au/insurance/home/get-a-quote
  → Plugin creates a "skeleton" adaptor (zero steps)
  → Opens the URL in DISCOVERY MODE
  → User fills the entire form manually
  → Plugin records every page: fields, buttons, URLs, structure
  → Full discovery session submitted to central service

USER B: "I also want to quote Suncorp"
  → Plugin detects the skeleton adaptor exists
  → Opens in discovery mode again (not enough data yet)
  → User fills the form, recording submitted
  → Central service ALIGNS both sessions:
    - Same URL patterns? Same fields? → Consensus reached
    - Steps promoted into the adaptor definition
    - Maturity: skeleton → discovered → emerging

USER C onwards:
  → Plugin now has real steps with field mappings
  → AUTO MODE kicks in — fills fields automatically
  → Any failures fall back to ASSIST MODE
  → Verifications increase confidence scores
  → Maturity: emerging → usable → stable
```

### Maturity Levels

| Level | Steps | Confidence | Behaviour |
|-------|-------|-----------|-----------|
| **skeleton** | 0 | 0 | Full discovery mode — user records everything |
| **discovered** | >0 | <0.3 | Steps exist but unverified — mostly assist mode |
| **emerging** | >0 | <0.3 | Multiple users contributed — some auto-fill works |
| **usable** | >0 | ≥0.3 | Most steps work automatically |
| **stable** | >0 | ≥0.7 | Reliable auto-fill, 5+ contributors |

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
POST /api/adaptors/bootstrap          → create skeleton adaptor from URL
POST /api/adaptors/:id/discovery      → submit full discovery session
GET  /api/adaptors/:id/maturity       → get adaptor maturity status
```

## File Structure (New/Modified)

```
src/
├── adaptors/
│   ├── types.ts                       # all types (adaptor, contribution, discovery)
│   ├── skeleton-factory.ts            # creates zero-knowledge skeleton adaptors
│   ├── adaptor-runtime.ts             # loads and executes adaptor definitions
│   ├── adaptor-cache.ts               # IndexedDB cache for adaptors
│   ├── adaptor-sync.ts                # fetch/push/bootstrap/discovery via central API
│   ├── transforms.ts                  # declarative transform system
│   └── seed/                          # bundled seed adaptors (offline fallback)
│       └── budget-direct-home.json
│
├── content/
│   ├── content-script.ts             # entry point: auto / hybrid / discovery routing
│   ├── automation-engine.ts          # legacy adapter step execution
│   ├── hybrid-automation-engine.ts   # auto/assist mode switching
│   ├── discovery-engine.ts           # full-form discovery for new insurers
│   ├── discovery-overlay.ts          # floating UI for discovery mode
│   ├── interaction-recorder.ts       # captures user interactions (no PII)
│   ├── assist-overlay.ts             # floating UI for single-step assist
│   ├── field-matcher.ts              # field finding and filling
│   ├── page-navigator.ts             # step/button detection, CAPTCHA
│   └── dom-observer.ts               # MutationObserver wrappers
│
├── popup/
│   ├── AddInsurer.tsx                # "Add New Insurer" bootstrap UI
│   ├── ProviderSelector.tsx          # provider list with maturity badges
│   └── ...
│
└── api/                              # central service (separate deploy)
    ├── server.ts
    ├── routes/
    │   ├── adaptors.ts
    │   ├── contributions.ts
    │   └── discovery.ts              # bootstrap + discovery session endpoints
    ├── services/
    │   ├── contribution-processor.ts # existing step contribution processing
    │   └── discovery-processor.ts    # merges discovery sessions into adaptors
    └── db/
        └── schema.sql               # includes discovery_sessions table
```

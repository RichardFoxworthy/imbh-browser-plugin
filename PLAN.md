# Insurance Quote Comparison Browser Plugin — Implementation Plan

## Overview

Build a Chrome browser extension (Manifest V3) that automates insurance quote form
filling across Australian insurers, enabling users to compare home & contents and motor
insurance quotes from a single profile. All data stays local on the user's device.

## Tech Stack

- **Extension**: Chrome Manifest V3 (with Firefox compatibility path)
- **Frontend**: React 18 + TypeScript
- **Build**: Vite + CRXJS (Vite plugin for Chrome extensions)
- **Styling**: Tailwind CSS
- **Local Storage**: IndexedDB (via idb library) with Web Crypto API encryption
- **State Management**: Zustand (lightweight, works well in extension contexts)
- **Form Automation**: Content scripts with MutationObserver-based DOM interaction
- **Testing**: Vitest + Playwright for adapter integration tests

## Project Structure

```
imbh-browser-plugin/
├── public/
│   ├── icons/              # Extension icons (16, 32, 48, 128px)
│   └── _locales/           # i18n strings
├── src/
│   ├── manifest.ts         # Manifest V3 definition (CRXJS format)
│   ├── background/
│   │   └── service-worker.ts   # Background orchestration, task queue
│   ├── popup/
│   │   ├── Popup.tsx           # Extension popup entry
│   │   └── main.tsx
│   ├── sidepanel/
│   │   ├── SidePanel.tsx       # Comparison dashboard
│   │   └── main.tsx
│   ├── content/
│   │   ├── automation-engine.ts    # Core form-filling engine
│   │   ├── dom-observer.ts         # MutationObserver wrapper
│   │   ├── field-matcher.ts        # Maps profile fields to DOM fields
│   │   └── page-navigator.ts       # Step navigation, button detection
│   ├── adapters/
│   │   ├── types.ts                # Adapter interface definitions
│   │   ├── adapter-registry.ts     # Registry of all adapters
│   │   ├── base-adapter.ts         # Shared adapter logic
│   │   ├── home/
│   │   │   ├── budget-direct.ts
│   │   │   ├── nrma.ts
│   │   │   ├── aami.ts
│   │   │   └── ...
│   │   └── motor/
│   │       ├── budget-direct.ts
│   │       ├── nrma.ts
│   │       ├── aami.ts
│   │       └── ...
│   ├── profile/
│   │   ├── types.ts                # TypeScript data models
│   │   ├── ProfileForm.tsx         # Multi-step profile wizard
│   │   ├── HomeContentsForm.tsx    # Home & contents fields
│   │   ├── MotorForm.tsx           # Motor insurance fields
│   │   └── PersonalDetailsForm.tsx # Shared personal details
│   ├── comparison/
│   │   ├── ComparisonTable.tsx     # Quote comparison grid
│   │   ├── QuoteCard.tsx           # Individual quote display
│   │   └── FilterControls.tsx      # Sort/filter UI
│   ├── storage/
│   │   ├── crypto.ts               # Web Crypto AES-GCM encryption
│   │   ├── db.ts                   # IndexedDB wrapper
│   │   └── profile-store.ts        # Encrypted profile CRUD
│   ├── quoting/
│   │   ├── quote-runner.ts         # Orchestrates multi-provider runs
│   │   ├── quote-store.ts          # Quote results storage
│   │   └── types.ts                # Quote result types
│   └── shared/
│       ├── constants.ts
│       ├── utils.ts
│       └── ui/                     # Shared UI components
│           ├── Button.tsx
│           ├── Input.tsx
│           ├── Select.tsx
│           ├── Stepper.tsx
│           └── Card.tsx
├── tests/
│   ├── unit/
│   │   ├── crypto.test.ts
│   │   ├── field-matcher.test.ts
│   │   └── profile-store.test.ts
│   ├── integration/
│   │   └── adapters/
│   │       └── budget-direct.test.ts
│   └── fixtures/
│       └── mock-pages/            # HTML snapshots of insurer forms
├── .gitignore
├── .eslintrc.cjs
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.cjs
└── README.md
```

## Data Models

### User Profile (stored locally, encrypted)

```typescript
interface UserProfile {
  id: string;
  createdAt: string;
  updatedAt: string;
  personal: PersonalDetails;
  home?: HomeContentsProfile;
  motor?: MotorProfile[];
}

interface PersonalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string;         // ISO date
  email: string;
  phone: string;
  currentAddress: Address;
  previousAddresses: Address[];
  claimsHistory: Claim[];
}

interface Address {
  unit?: string;
  streetNumber: string;
  streetName: string;
  suburb: string;
  state: AustralianState;
  postcode: string;
  yearsAtAddress: number;
}

type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

interface Claim {
  type: 'home' | 'contents' | 'motor';
  date: string;
  description: string;
  amount: number;
  atFault: boolean;
}

interface HomeContentsProfile {
  propertyType: 'house' | 'apartment' | 'townhouse' | 'unit';
  ownershipStatus: 'owner-occupier' | 'landlord' | 'tenant';
  constructionType: 'brick' | 'brick-veneer' | 'weatherboard' | 'concrete' | 'other';
  roofType: 'tile' | 'metal' | 'concrete' | 'other';
  yearBuilt: number;
  numberOfBedrooms: number;
  numberOfBathrooms: number;
  numberOfStoreys: number;
  landArea: number;              // sqm
  swimmingPool: boolean;
  poolFenced: boolean;
  securityAlarm: boolean;
  securityCameras: boolean;
  deadlocks: boolean;
  smokeAlarms: boolean;
  buildingSumInsured: number;
  contentsSumInsured: number;
  specifiedItems: SpecifiedItem[];
  coverType: 'home-only' | 'contents-only' | 'home-and-contents';
  excessPreference: number;      // preferred excess amount
}

interface SpecifiedItem {
  description: string;
  value: number;
  category: string;
}

interface MotorProfile {
  vehicle: VehicleDetails;
  drivers: DriverDetails[];
  coverType: 'comprehensive' | 'third-party-fire-theft' | 'third-party';
  agreedValue?: number;
  marketValue: boolean;
  parkingLocation: 'garage' | 'carport' | 'driveway' | 'street' | 'secure-parking';
  dailyKilometres: 'under-15k' | '15k-25k' | '25k-35k' | 'over-35k';
  businessUse: boolean;
  modifications: string[];
  financeOwing: boolean;
  excessPreference: number;
}

interface VehicleDetails {
  make: string;
  model: string;
  year: number;
  variant?: string;
  bodyType: string;
  transmission: 'automatic' | 'manual';
  engineSize: string;
  fuelType: 'petrol' | 'diesel' | 'electric' | 'hybrid' | 'lpg';
  colour: string;
  registration: string;
  registrationState: AustralianState;
}

interface DriverDetails {
  relationship: 'self' | 'spouse' | 'child' | 'other';
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  licenceType: 'full' | 'provisional' | 'learner';
  licenceYears: number;
  claimsHistory: Claim[];
}
```

### Adapter Interface

```typescript
interface InsuranceAdapter {
  id: string;
  name: string;
  provider: string;
  productType: 'home' | 'contents' | 'home-and-contents' | 'motor';
  logoUrl: string;
  startUrl: string;
  enabled: boolean;

  // Returns ordered steps the automation should follow
  getSteps(profile: UserProfile): AdapterStep[];

  // Extracts quote result from the final page
  extractQuote(document: Document): QuoteResult | null;

  // Health check — can the adapter reach the start page?
  healthCheck(): Promise<AdapterHealth>;
}

interface AdapterStep {
  name: string;
  waitForSelector: string;
  fields: FieldMapping[];
  nextAction: ActionMapping;
  timeout: number;           // ms to wait before considering step failed
}

interface FieldMapping {
  selector: string;
  fallbackSelectors: string[];
  labelMatch?: string;       // fuzzy match against field label text
  profilePath: string;       // dot-notation path into UserProfile
  action: 'type' | 'select' | 'click' | 'radio' | 'checkbox' | 'typeAndSelect';
  transform?: (value: any) => string;  // transform profile value to form value
}

interface QuoteResult {
  provider: string;
  product: string;
  premium: { annual: number; monthly?: number };
  excess: number;
  inclusions: string[];
  exclusions: string[];
  retrievedAt: string;
  sourceUrl: string;
  raw: Record<string, string>;  // all extracted data points
}
```

## Implementation Steps

### Step 1: Project Scaffold & Build Pipeline
- Initialise Vite + CRXJS + React + TypeScript project
- Configure Manifest V3 with appropriate permissions
- Set up Tailwind CSS
- Create `.gitignore`, ESLint config, tsconfig
- Verify extension loads in Chrome with empty popup
- **Files**: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`,
  `postcss.config.cjs`, `.gitignore`, `.eslintrc.cjs`, `src/manifest.ts`,
  `src/popup/main.tsx`, `src/popup/Popup.tsx`

### Step 2: Encrypted Local Storage Layer
- Implement Web Crypto AES-GCM key derivation from user passphrase (PBKDF2)
- Build IndexedDB wrapper using `idb` library
- Create encrypted profile store: save, load, update, delete profiles
- Create encrypted quote store for results
- Unit tests for encryption round-trip and store operations
- **Files**: `src/storage/crypto.ts`, `src/storage/db.ts`, `src/storage/profile-store.ts`,
  `src/quoting/quote-store.ts`, `tests/unit/crypto.test.ts`,
  `tests/unit/profile-store.test.ts`

### Step 3: Profile Creation UI
- Build multi-step form wizard component (Stepper)
- Personal details form (name, DOB, address, contact)
- Home & contents form (property details, security, sums insured)
- Motor form (vehicle, drivers, cover preferences)
- Claims history form (shared across product types)
- Profile review/summary step
- Connect forms to encrypted profile store
- **Files**: `src/profile/*.tsx`, `src/shared/ui/*.tsx`

### Step 4: Core Form Automation Engine
- Content script that receives instructions from background service worker
- DOM observer using MutationObserver for dynamic form detection
- Field matcher: given a FieldMapping, locate and fill form fields
  - Selector-based matching (primary + fallbacks)
  - Label-based fuzzy matching as final fallback
- Human-like interaction: randomised typing delays (50-150ms per char),
  randomised pauses between fields (500-2000ms), mouse movement simulation
- Page navigator: detect and click "next"/"continue" buttons
- CAPTCHA detection: pause automation and notify user
- Error recovery: retry failed field fills, skip and flag unresolvable fields
- **Files**: `src/content/automation-engine.ts`, `src/content/dom-observer.ts`,
  `src/content/field-matcher.ts`, `src/content/page-navigator.ts`,
  `tests/unit/field-matcher.test.ts`

### Step 5: Background Service Worker & Messaging
- Task queue for managing multi-provider quote runs
- Chrome messaging API bridge between popup/sidepanel and content scripts
- Tab management: open insurer tabs, inject content scripts, track progress
- Resumable state machine to survive MV3 service worker restarts
  (persist state to IndexedDB on each step transition)
- Rate limiting: max 1 concurrent request per domain,
  3-15 second random delays between page loads
- **Files**: `src/background/service-worker.ts`,
  `src/background/task-queue.ts`, `src/background/tab-manager.ts`

### Step 6: First Adapter — Budget Direct Home & Contents
- Implement the adapter interface for Budget Direct's home insurance quote form
- Map all form steps with selectors (to be verified against live site)
- Implement quote extraction from results page
- Health check endpoint
- Integration test with mock HTML fixtures
- **Files**: `src/adapters/home/budget-direct.ts`, `src/adapters/base-adapter.ts`,
  `src/adapters/types.ts`, `src/adapters/adapter-registry.ts`,
  `tests/integration/adapters/budget-direct.test.ts`,
  `tests/fixtures/mock-pages/budget-direct-home/`

### Step 7: Quote Run UI & Progress Tracking
- Provider selection screen (checkboxes with insurer logos)
- "Start Quoting" flow that triggers background service worker
- Real-time progress display: which provider is running, current step, status
- Handle CAPTCHA interruptions: surface to user with clear instructions
- Handle unknown fields: pause and ask user, store answer for future runs
- Display individual quote results as they complete
- **Files**: `src/popup/ProviderSelector.tsx`, `src/popup/QuoteProgress.tsx`,
  `src/popup/QuoteResult.tsx`

### Step 8: Comparison Dashboard (Side Panel)
- Chrome side panel implementation for persistent comparison view
- Sortable/filterable comparison table
- Quote cards with premium, excess, key inclusions/exclusions
- Coverage detail drill-down
- "Go to insurer" links that open the quote page for purchase
- Export to CSV/JSON
- **Files**: `src/sidepanel/SidePanel.tsx`, `src/sidepanel/main.tsx`,
  `src/comparison/ComparisonTable.tsx`, `src/comparison/QuoteCard.tsx`,
  `src/comparison/FilterControls.tsx`

### Step 9: Additional Adapters (Top 5 Insurers)
- NRMA home & contents adapter
- AAMI home & contents adapter
- Allianz home & contents adapter
- Youi home & contents adapter
- Budget Direct motor adapter
- Each with placeholder selectors, health checks, and test fixtures
- **Files**: `src/adapters/home/*.ts`, `src/adapters/motor/budget-direct.ts`

### Step 10: Adapter Health Monitoring
- Automated health check runner (on extension startup + scheduled)
- Visual indicator in provider selection: green/amber/red status
- Health check logs stored locally
- Notification when an adapter breaks
- **Files**: `src/adapters/health-monitor.ts`, `src/popup/AdapterStatus.tsx`

### Step 11: Settings, Onboarding & Polish
- First-run onboarding flow explaining what the extension does and privacy model
- Settings page: passphrase management, rate limit preferences,
  automation speed (cautious/normal/fast), visible vs background tabs
- Privacy dashboard: view all stored data, export, delete
- robots.txt respect toggle (on by default)
- Error reporting (opt-in, no PII)
- **Files**: `src/popup/Onboarding.tsx`, `src/popup/Settings.tsx`,
  `src/popup/PrivacyDashboard.tsx`

### Step 12: Remaining Motor Adapters & Batch Stubs
- NRMA motor adapter
- AAMI motor adapter
- Stub adapters for remaining ~15 Australian insurers (home + motor)
  with start URLs and empty step definitions, ready for selector population
- **Files**: `src/adapters/motor/*.ts`, `src/adapters/home/*.ts`

## Compliance Guardrails (Built Into Every Step)

| Guardrail | Implementation |
|-----------|---------------|
| robots.txt respect | Parse and honour on each domain before automation starts |
| Human-like pacing | Randomised 3-15s between page loads, 50-150ms typing |
| No credential sharing | Extension never transmits cookies/tokens externally |
| User transparency | Full log of pages visited and data extracted |
| Opt-out compliance | If site blocks extension, accept gracefully |
| No redistribution | Data for user's personal use only |
| Encrypted PII | All profile data AES-GCM encrypted at rest |
| Soft volume caps | Warning after 20 quotes in one session |

## Target Australian Insurers

### Home & Contents
1. Budget Direct
2. NRMA (NSW/ACT)
3. AAMI
4. Allianz
5. Youi
6. QBE
7. GIO
8. CGU
9. RACV (VIC)
10. RACQ (QLD)
11. Woolworths Insurance
12. Coles Insurance
13. CommInsure
14. Real Insurance
15. Bingle

### Motor
Same providers, separate adapters for each motor quote form.

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Adapter breakage (insurers change forms) | Health monitoring, fallback selectors, label-based matching |
| AFSL regulatory concern | No recommendations — present quotes without ranking/advice |
| CAPTCHA blocking | Pause and surface to user for manual solve |
| MV3 service worker timeout | Resumable state machine persisted to IndexedDB |
| PII security | Web Crypto encryption, no server transmission, passphrase-gated |
| Chrome Web Store rejection | Clear privacy policy, minimal permissions, transparent behaviour |

## Out of Scope for Initial Build

- Cloud task planner / LLM integration
- Mobile companion app
- Renewal reminders and scheduling
- PDF policy document parsing
- Team/enterprise features
- Payment/monetisation infrastructure

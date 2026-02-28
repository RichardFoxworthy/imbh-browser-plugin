/**
 * Types for the crowdsourced adaptor system.
 *
 * Adaptors are JSON data documents (not TypeScript classes) that describe
 * how to navigate through an insurer's quote form. They are fetched from
 * a central service, cached locally, and updated through crowdsourced
 * user contributions.
 */

import type { ProductType, FieldMapping, ActionMapping } from '../adapters/types';

// ---------------------------------------------------------------------------
// Adaptor Definition — the core data model
// ---------------------------------------------------------------------------

export interface AdaptorDefinition {
  id: string;                       // e.g. 'budget-direct-home'
  version: number;                  // incremented on each change
  provider: string;                 // display name, e.g. 'Budget Direct'
  productType: ProductType;
  logoUrl: string;
  startUrl: string;
  enabled: boolean;
  updatedAt: string;                // ISO timestamp of last update

  steps: AdaptorStep[];
  extractionRules: ExtractionRules;
}

export interface AdaptorStep {
  id: string;                       // stable identifier, e.g. 'address'
  name: string;                     // human label, e.g. 'Property Address'
  urlPattern?: string;              // regex to match expected URL at this step
  waitForSelector: string;          // primary selector to detect step is loaded
  fallbackWaitSelectors: string[];  // tried in order if primary fails
  fields: FieldMapping[];
  nextAction: ActionMapping;
  timeout: number;                  // ms

  // Crowdsource metadata
  confidence: number;               // 0–1
  lastVerified: string;             // ISO timestamp
  contributorCount: number;
  failureCount: number;
}

export interface ExtractionRules {
  premiumSelectors: string[];
  excessSelectors: string[];
  inclusionSelectors: string[];
  exclusionSelectors: string[];
  confidence: number;
  lastVerified: string;
}

// ---------------------------------------------------------------------------
// Contributions — what users send back (never contains PII)
// ---------------------------------------------------------------------------

export type ContributionType =
  | 'verification'     // step worked as expected
  | 'update'           // existing step, but selectors changed
  | 'new_step'         // previously unknown step/page
  | 'failure_report';  // step failed, couldn't auto-fill

export interface StepContribution {
  adaptorId: string;
  stepId: string | null;            // null for newly discovered steps
  type: ContributionType;
  timestamp: string;
  pluginVersion: string;

  // Page context (no PII)
  pageUrl: string;                  // domain + path only, no query params
  pageTitle: string;

  // Discovered fields (only present for 'update' and 'new_step')
  fields?: DiscoveredField[];

  // Navigation (only present for 'update' and 'new_step')
  nextButton?: {
    selector: string;
    text: string;
  };

  // For failure_report: which selectors failed
  failedSelectors?: string[];

  // Position in the flow (helps order new steps)
  afterStepId?: string;             // which known step came before this
}

export interface DiscoveredField {
  selector: string;                 // most specific CSS selector for this field
  fallbackSelectors: string[];      // alternative selectors
  tagName: string;                  // input, select, textarea, etc.
  inputType: string;                // text, email, tel, number, radio, checkbox, etc.
  name: string;                     // name attribute
  id: string;                       // id attribute
  label: string;                    // associated <label> text
  placeholder: string;
  ariaLabel: string;
  options?: string[];               // for select/radio: the available option labels
  suggestedAction?: FieldMapping['action'];
  suggestedProfilePath?: string;    // best-guess mapping to UserProfile field
}

// ---------------------------------------------------------------------------
// Adaptor sync metadata
// ---------------------------------------------------------------------------

export interface AdaptorVersionMap {
  [adaptorId: string]: number;      // id → version
}

export interface CachedAdaptor {
  adaptorId: string;
  definition: AdaptorDefinition;
  cachedAt: string;                 // when we fetched it
}

export interface PendingContribution {
  id: string;                       // local UUID
  contribution: StepContribution;
  createdAt: string;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Auto/Assist mode state
// ---------------------------------------------------------------------------

export type NavigationMode = 'auto' | 'assist' | 'paused-captcha';

export interface NavigationState {
  adaptorId: string;
  mode: NavigationMode;
  currentStepIndex: number;
  totalSteps: number;
  currentStepId: string | null;
  assistReason?: string;            // why we switched to assist mode
}

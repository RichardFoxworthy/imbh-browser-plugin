/**
 * Discovery Engine
 *
 * Runs when a user navigates an insurer's form for the very first time
 * (skeleton adaptor with zero steps). Records the entire journey —
 * every page, every field, every navigation action — to build
 * a complete adaptor definition from scratch.
 *
 * Unlike assist mode (which records a single unknown step mid-flow),
 * discovery mode captures the ENTIRE flow from start to quote result.
 *
 * Privacy: only structural information is captured. No user input values.
 */

import {
  startRecording,
  stopRecording,
  analyseRecording,
} from './interaction-recorder';
import { waitForPageStable } from './dom-observer';
import { uid } from '../shared/utils';
import type {
  DiscoverySession,
  DiscoveredStep,
  ExtractionHints,
  DiscoveredField,
} from '../adaptors/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveryProgress {
  adaptorId: string;
  adaptorName: string;
  mode: 'discovery';
  stepCount: number;
  status: 'recording' | 'awaiting-next' | 'identifying-results' | 'completed' | 'cancelled';
  message: string;
  currentPageUrl: string;
}

export interface DiscoveryResult {
  session: DiscoverySession | null;
  cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface DiscoveryState {
  active: boolean;
  adaptorId: string;
  adaptorName: string;
  sessionId: string;
  pluginVersion: string;
  startedAt: string;
  steps: DiscoveredStep[];
  currentStepStart: number;
  onProgress: ((progress: DiscoveryProgress) => void) | null;
  resolveDiscovery: ((result: DiscoveryResult) => void) | null;
}

const state: DiscoveryState = {
  active: false,
  adaptorId: '',
  adaptorName: '',
  sessionId: '',
  pluginVersion: '1.0.0',
  startedAt: '',
  steps: [],
  currentStepStart: 0,
  onProgress: null,
  resolveDiscovery: null,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a full discovery session. The user will navigate the entire
 * insurer form manually while we record everything.
 *
 * Returns a promise that resolves when the user completes discovery
 * or cancels.
 */
export function startDiscovery(options: {
  adaptorId: string;
  adaptorName: string;
  pluginVersion?: string;
  onProgress: (progress: DiscoveryProgress) => void;
}): Promise<DiscoveryResult> {
  if (state.active) {
    return Promise.resolve({ session: null, cancelled: true });
  }

  state.active = true;
  state.adaptorId = options.adaptorId;
  state.adaptorName = options.adaptorName;
  state.sessionId = uid();
  state.pluginVersion = options.pluginVersion || '1.0.0';
  state.startedAt = new Date().toISOString();
  state.steps = [];
  state.currentStepStart = Date.now();
  state.onProgress = options.onProgress;

  // Start recording interactions on the current page
  startRecording();

  emitProgress('recording', 'Navigate the form — we\'re learning the flow.');

  // Listen for navigation events to detect step boundaries
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Use a MutationObserver to detect SPA-style page changes
  startPageChangeDetection();

  return new Promise((resolve) => {
    state.resolveDiscovery = resolve;
  });
}

/**
 * Signal that the user has completed a step and moved to the next page.
 * Call this when the discovery overlay's "Next Step" button is clicked.
 */
export function captureCurrentStep(): DiscoveredStep {
  const interactions = stopRecording();
  const { fields, nextButton } = analyseRecording(interactions);

  const step: DiscoveredStep = {
    ordinal: state.steps.length,
    pageUrl: sanitiseUrl(window.location.href),
    pageTitle: document.title,
    suggestedName: inferStepName(fields, document.title, state.steps.length),
    waitForSelector: inferWaitSelector(),
    fallbackWaitSelectors: inferFallbackWaitSelectors(),
    fields,
    nextButton,
    durationMs: Date.now() - state.currentStepStart,
  };

  state.steps.push(step);
  state.currentStepStart = Date.now();

  // Start recording on the new page
  startRecording();

  emitProgress('recording', `Step ${state.steps.length} captured. Continue filling the form.`);

  return step;
}

/**
 * Signal that the current page is the quote results page.
 * Captures extraction hints and completes the discovery session.
 */
export function markAsResultsPage(hints: ExtractionHints): void {
  // Capture the final step (might have fields like "review your details")
  const interactions = stopRecording();
  const { fields, nextButton } = analyseRecording(interactions);

  if (fields.length > 0) {
    state.steps.push({
      ordinal: state.steps.length,
      pageUrl: sanitiseUrl(window.location.href),
      pageTitle: document.title,
      suggestedName: 'Review / Results',
      waitForSelector: inferWaitSelector(),
      fallbackWaitSelectors: inferFallbackWaitSelectors(),
      fields,
      nextButton,
      durationMs: Date.now() - state.currentStepStart,
    });
  }

  const session: DiscoverySession = {
    adaptorId: state.adaptorId,
    sessionId: state.sessionId,
    pluginVersion: state.pluginVersion,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    steps: state.steps,
    extractionHints: hints,
  };

  emitProgress('completed', `Discovery complete! Captured ${state.steps.length} steps.`);
  cleanup();

  state.resolveDiscovery?.({ session, cancelled: false });
  state.resolveDiscovery = null;
}

/**
 * Cancel discovery without submitting.
 */
export function cancelDiscovery(): void {
  stopRecording();
  emitProgress('cancelled', 'Discovery cancelled.');
  cleanup();

  state.resolveDiscovery?.({ session: null, cancelled: true });
  state.resolveDiscovery = null;
}

/**
 * Check if a discovery session is currently active.
 */
export function isDiscoveryActive(): boolean {
  return state.active;
}

/**
 * Get the number of steps captured so far.
 */
export function getDiscoveredStepCount(): number {
  return state.steps.length;
}

// ---------------------------------------------------------------------------
// Page-change detection
// ---------------------------------------------------------------------------

let pageObserver: MutationObserver | null = null;
let lastUrl = '';

function startPageChangeDetection(): void {
  lastUrl = window.location.href;

  // Poll for URL changes (handles pushState/replaceState)
  const urlCheckInterval = setInterval(() => {
    if (!state.active) {
      clearInterval(urlCheckInterval);
      return;
    }

    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      handlePageChange();
    }
  }, 500);

  // Also observe major DOM mutations (SPA page transitions)
  pageObserver = new MutationObserver((mutations) => {
    // Heuristic: if many nodes were added/removed, it's probably a page change
    const totalChanges = mutations.reduce(
      (sum, m) => sum + m.addedNodes.length + m.removedNodes.length,
      0
    );
    if (totalChanges > 20) {
      // Debounce — wait for DOM to settle
      waitForPageStable(800).then(() => {
        if (state.active && window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          handlePageChange();
        }
      });
    }
  });

  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function handlePageChange(): void {
  // Auto-capture the previous step when the URL changes
  // (the user navigated by clicking a button on the form)
  if (state.active) {
    emitProgress('awaiting-next',
      `Page changed. Step ${state.steps.length + 1} detected — continue filling the form.`);
  }
}

function handleBeforeUnload(): void {
  // Capture current step before page unloads (full navigation)
  if (state.active) {
    captureCurrentStep();
  }
}

// ---------------------------------------------------------------------------
// Extraction hint helpers
// ---------------------------------------------------------------------------

/**
 * Scan the current page for elements that look like price/premium displays.
 * Returns candidate selectors for the user to confirm.
 */
export function findPremiumCandidates(): Array<{ selector: string; text: string }> {
  const candidates: Array<{ selector: string; text: string }> = [];
  const pricePattern = /\$[\d,]+(?:\.\d{2})?/;

  // Check common premium container patterns
  const selectors = [
    '[class*="premium"]', '[class*="price"]', '[class*="total"]',
    '[class*="amount"]', '[class*="quote"]', '[class*="result"]',
    '[data-testid*="premium"]', '[data-testid*="price"]',
    'h1', 'h2', 'h3', '.highlight', '.summary',
  ];

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      const text = (el.textContent || '').trim();
      if (pricePattern.test(text) && text.length < 200) {
        candidates.push({
          selector: buildUniqueSelector(el as HTMLElement),
          text: text.slice(0, 100),
        });
      }
    });
  }

  // Also scan all text nodes for price patterns
  if (candidates.length === 0) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          pricePattern.test(node.textContent || '')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
        candidates.push({
          selector: buildUniqueSelector(parent),
          text: (parent.textContent || '').trim().slice(0, 100),
        });
      }
    }
  }

  // Deduplicate by selector
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.selector)) return false;
    seen.add(c.selector);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emitProgress(
  status: DiscoveryProgress['status'],
  message: string
): void {
  state.onProgress?.({
    adaptorId: state.adaptorId,
    adaptorName: state.adaptorName,
    mode: 'discovery',
    stepCount: state.steps.length,
    status,
    message,
    currentPageUrl: sanitiseUrl(window.location.href),
  });
}

function cleanup(): void {
  state.active = false;
  window.removeEventListener('beforeunload', handleBeforeUnload);
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }
}

/**
 * Infer the best wait-for selector for the current page.
 * Picks the most distinctive form container or heading.
 */
function inferWaitSelector(): string {
  // Try to find a distinctive heading or form container
  const candidates: string[] = [];

  // Page-specific form
  const form = document.querySelector('form');
  if (form?.id) candidates.push(`#${CSS.escape(form.id)}`);

  // Main heading
  const h1 = document.querySelector('h1');
  if (h1?.id) candidates.push(`#${CSS.escape(h1.id)}`);

  // data-testid on a container
  const testIdEl = document.querySelector('[data-testid]');
  if (testIdEl) {
    candidates.push(`[data-testid="${CSS.escape(testIdEl.getAttribute('data-testid')!)}"]`);
  }

  // Distinctive class on main content
  const main = document.querySelector('main, [role="main"], .main-content, #content');
  if (main) {
    candidates.push(buildUniqueSelector(main as HTMLElement));
  }

  // Fallback: first form field
  const firstField = document.querySelector('input:not([type="hidden"]), select, textarea');
  if (firstField) {
    candidates.push(buildUniqueSelector(firstField as HTMLElement));
  }

  return candidates[0] || 'body';
}

function inferFallbackWaitSelectors(): string[] {
  const fallbacks: string[] = [];

  const form = document.querySelector('form');
  if (form) fallbacks.push('form');

  const firstInput = document.querySelector('input:not([type="hidden"])');
  if (firstInput) {
    const sel = buildUniqueSelector(firstInput as HTMLElement);
    fallbacks.push(sel);
  }

  return fallbacks.slice(0, 3);
}

/**
 * Infer a human-readable step name from the fields and page title.
 */
function inferStepName(
  fields: DiscoveredField[],
  pageTitle: string,
  stepIndex: number
): string {
  // Check if any field labels give us a clue about the section
  const labels = fields
    .map((f) => f.label)
    .filter(Boolean)
    .map((l) => l.toLowerCase());

  const sectionHints: Array<[RegExp, string]> = [
    [/address|suburb|postcode/, 'Address Details'],
    [/first\s*name|last\s*name|date\s*of\s*birth/, 'Personal Details'],
    [/email|phone|contact/, 'Contact Details'],
    [/property|dwelling|building/, 'Property Details'],
    [/construction|roof|wall/, 'Construction Details'],
    [/security|alarm|lock/, 'Security Details'],
    [/sum\s*insured|cover|excess/, 'Cover Options'],
    [/make|model|year|rego|vehicle/, 'Vehicle Details'],
    [/driver|licence|license/, 'Driver Details'],
    [/claim|history/, 'Claims History'],
    [/payment|pay/, 'Payment'],
  ];

  const allLabels = labels.join(' ');
  for (const [pattern, name] of sectionHints) {
    if (pattern.test(allLabels)) return name;
  }

  // Try the page title
  if (pageTitle && pageTitle.length < 60) {
    // Strip common suffixes
    const cleaned = pageTitle
      .replace(/\s*[-|]\s*.+$/, '')
      .replace(/quote/i, '')
      .trim();
    if (cleaned.length > 3 && cleaned.length < 40) return cleaned;
  }

  return `Step ${stepIndex + 1}`;
}

/**
 * Build the most unique CSS selector possible for an element.
 */
function buildUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

  const name = el.getAttribute('name');
  if (name) {
    const tag = el.tagName.toLowerCase();
    return `${tag}[name="${CSS.escape(name)}"]`;
  }

  // Structural fallback
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  let depth = 0;

  while (current && current !== document.body && depth < 3) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      return `#${CSS.escape(current.id)} ${parts.length > 0 ? '> ' + parts.reverse().join(' > ') : ''}`.trim();
    }
    const meaningful = Array.from(current.classList)
      .filter((c) => !/^(p[xytblr]?-|m[xytblr]?-|w-|h-|flex|grid|text-|bg-|border-)/.test(c))
      .slice(0, 2);
    if (meaningful.length) part += '.' + meaningful.map(CSS.escape).join('.');
    parts.push(part);
    current = current.parentElement;
    depth++;
  }

  return parts.reverse().join(' > ');
}

function sanitiseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

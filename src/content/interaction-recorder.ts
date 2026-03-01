/**
 * Interaction Recorder
 *
 * Captures user interactions with form fields during assist mode.
 * Records ONLY structural information (selectors, labels, field types) —
 * NEVER captures actual values the user types (no PII).
 *
 * Activated when the automation engine can't find expected selectors
 * and needs the user to navigate manually.
 */

import type { DiscoveredField, StepContribution } from '../adaptors/types';
import type { ActionMapping } from '../adapters/types';

export interface RecordedInteraction {
  type: 'field_focus' | 'field_change' | 'button_click' | 'page_navigation';
  timestamp: number;
  selector: string;
  element: ElementSnapshot;
}

export interface ElementSnapshot {
  tagName: string;
  id: string;
  name: string;
  type: string;             // input type
  className: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  text: string;             // innerText for buttons, empty for inputs
  options?: string[];       // for <select> elements
}

interface RecorderState {
  active: boolean;
  interactions: RecordedInteraction[];
  startUrl: string;
  startTime: number;
  listeners: Array<{ target: EventTarget; type: string; handler: EventListener }>;
}

const state: RecorderState = {
  active: false,
  interactions: [],
  startUrl: '',
  startTime: 0,
  listeners: [],
};

/**
 * Start recording user interactions on the current page.
 * Call this when switching to assist mode.
 */
export function startRecording(): void {
  if (state.active) return;

  state.active = true;
  state.interactions = [];
  state.startUrl = sanitiseUrl(window.location.href);
  state.startTime = Date.now();

  // Attach listeners to capture form interactions
  attachListener(document, 'focusin', handleFocusIn);
  attachListener(document, 'change', handleChange);
  attachListener(document, 'click', handleClick, true);  // capture phase for buttons
}

/**
 * Stop recording and return all captured interactions.
 */
export function stopRecording(): RecordedInteraction[] {
  if (!state.active) return [];

  state.active = false;

  // Remove all listeners
  for (const { target, type, handler } of state.listeners) {
    target.removeEventListener(type, handler, true);
  }
  state.listeners = [];

  return [...state.interactions];
}

/**
 * Check if currently recording.
 */
export function isRecording(): boolean {
  return state.active;
}

/**
 * Analyse recorded interactions and produce a list of discovered fields
 * suitable for contributing to the central adaptor service.
 */
export function analyseRecording(interactions: RecordedInteraction[]): {
  fields: DiscoveredField[];
  nextButton: { selector: string; text: string } | undefined;
} {
  const fieldMap = new Map<string, DiscoveredField>();
  let nextButton: { selector: string; text: string } | undefined;

  for (const interaction of interactions) {
    if (interaction.type === 'field_focus' || interaction.type === 'field_change') {
      const el = interaction.element;
      if (!isFormElement(el.tagName)) continue;

      const key = interaction.selector || `${el.tagName}#${el.id}.${el.name}`;
      if (!fieldMap.has(key)) {
        fieldMap.set(key, {
          selector: interaction.selector,
          fallbackSelectors: buildFallbackSelectors(el),
          tagName: el.tagName.toLowerCase(),
          inputType: el.type || '',
          name: el.name || '',
          id: el.id || '',
          label: el.label || '',
          placeholder: el.placeholder || '',
          ariaLabel: el.ariaLabel || '',
          options: el.options,
          suggestedAction: inferAction(el),
          suggestedProfilePath: inferProfilePath(el),
        });
      }
    }

    if (interaction.type === 'button_click') {
      const el = interaction.element;
      if (isNavigationButton(el)) {
        nextButton = {
          selector: interaction.selector,
          text: el.text || '',
        };
      }
    }
  }

  return {
    fields: Array.from(fieldMap.values()),
    nextButton,
  };
}

/**
 * Build a StepContribution from the recorded session.
 * This is what gets sent to the central service.
 */
export function buildContribution(
  adaptorId: string,
  afterStepId: string | null,
  interactions: RecordedInteraction[],
  pluginVersion: string
): StepContribution {
  const { fields, nextButton } = analyseRecording(interactions);

  return {
    adaptorId,
    stepId: null, // new step — no known ID
    type: 'new_step',
    timestamp: new Date().toISOString(),
    pluginVersion,
    pageUrl: sanitiseUrl(window.location.href),
    pageTitle: document.title,
    fields,
    nextButton,
    afterStepId: afterStepId ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function attachListener(
  target: EventTarget,
  type: string,
  handler: EventListener,
  capture = false
): void {
  target.addEventListener(type, handler, capture);
  state.listeners.push({ target, type, handler });
}

function handleFocusIn(e: Event): void {
  const el = e.target as HTMLElement;
  if (!el || !isFormElement(el.tagName)) return;

  state.interactions.push({
    type: 'field_focus',
    timestamp: Date.now(),
    selector: buildSelector(el),
    element: snapshotElement(el),
  });
}

function handleChange(e: Event): void {
  const el = e.target as HTMLElement;
  if (!el || !isFormElement(el.tagName)) return;

  state.interactions.push({
    type: 'field_change',
    timestamp: Date.now(),
    selector: buildSelector(el),
    element: snapshotElement(el),
  });
}

function handleClick(e: Event): void {
  const el = e.target as HTMLElement;
  if (!el) return;

  // Only record clicks on interactive elements
  const clickable = el.closest('button, a, [role="button"], input[type="submit"], input[type="radio"], input[type="checkbox"]');
  if (!clickable) return;

  const isButton = clickable.tagName === 'BUTTON' || clickable.tagName === 'A' ||
    clickable.getAttribute('role') === 'button' ||
    (clickable as HTMLInputElement).type === 'submit';

  state.interactions.push({
    type: isButton ? 'button_click' : 'field_change',
    timestamp: Date.now(),
    selector: buildSelector(clickable as HTMLElement),
    element: snapshotElement(clickable as HTMLElement),
  });
}

/**
 * Build the best CSS selector we can for an element.
 * Prefers id, then data-testid, then name, then a structural path.
 */
function buildSelector(el: HTMLElement): string {
  // Best case: has an ID
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  // data-testid
  const testId = el.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }

  // name attribute (for form fields)
  const name = el.getAttribute('name');
  if (name) {
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type');
    const typeSelector = type ? `[type="${type}"]` : '';
    return `${tag}[name="${CSS.escape(name)}"]${typeSelector}`;
  }

  // aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    return `[aria-label="${CSS.escape(ariaLabel)}"]`;
  }

  // Fall back to structural selector
  return buildStructuralSelector(el);
}

/**
 * Build a structural CSS selector using tag, class, and position.
 */
function buildStructuralSelector(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  let depth = 0;

  while (current && current !== document.body && depth < 4) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      part = `#${CSS.escape(current.id)}`;
      parts.unshift(part);
      break;
    }

    // Add meaningful classes (skip utility classes)
    const classes = Array.from(current.classList)
      .filter((c) => !isUtilityClass(c))
      .slice(0, 2);
    if (classes.length > 0) {
      part += '.' + classes.map(CSS.escape).join('.');
    }

    // nth-child if needed for disambiguation
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
    depth++;
  }

  return parts.join(' > ');
}

/**
 * Build fallback selectors for an element.
 */
function buildFallbackSelectors(el: ElementSnapshot): string[] {
  const fallbacks: string[] = [];

  if (el.name) {
    fallbacks.push(`[name*="${el.name}"]`);
  }
  if (el.placeholder) {
    fallbacks.push(`[placeholder*="${el.placeholder.slice(0, 30)}"]`);
  }
  if (el.ariaLabel) {
    fallbacks.push(`[aria-label*="${el.ariaLabel.slice(0, 30)}"]`);
  }
  if (el.label) {
    // Can't directly select by label text via CSS, but this hint
    // is useful for the label-fuzzy-match fallback in field-matcher
    fallbacks.push(`/* label: "${el.label.slice(0, 40)}" */`);
  }

  return fallbacks;
}

/**
 * Snapshot an element's structural properties (no values/PII).
 */
function snapshotElement(el: HTMLElement): ElementSnapshot {
  const label = findAssociatedLabel(el);
  const options = el.tagName === 'SELECT'
    ? Array.from((el as HTMLSelectElement).options).map((o) => o.text)
    : undefined;

  return {
    tagName: el.tagName,
    id: el.id || '',
    name: el.getAttribute('name') || '',
    type: el.getAttribute('type') || '',
    className: Array.from(el.classList).filter((c) => !isUtilityClass(c)).join(' '),
    label: label || '',
    placeholder: el.getAttribute('placeholder') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    text: isFormElement(el.tagName) ? '' : (el.innerText || '').slice(0, 50),
    options,
  };
}

/**
 * Find the label text associated with a form element.
 */
function findAssociatedLabel(el: HTMLElement): string {
  // Explicit <label for="...">
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return (label.textContent || '').trim().slice(0, 60);
  }

  // Wrapping <label>
  const wrappingLabel = el.closest('label');
  if (wrappingLabel) {
    // Get label text without the input's own text
    const clone = wrappingLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
    return (clone.textContent || '').trim().slice(0, 60);
  }

  // aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return (labelEl.textContent || '').trim().slice(0, 60);
  }

  return '';
}

function isFormElement(tagName: string): boolean {
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName.toUpperCase());
}

function isNavigationButton(el: ElementSnapshot): boolean {
  const text = el.text.toLowerCase();
  const navWords = ['next', 'continue', 'proceed', 'submit', 'get quote', 'calculate'];
  return navWords.some((w) => text.includes(w));
}

function isUtilityClass(className: string): boolean {
  // Filter out Tailwind / utility classes that aren't meaningful selectors
  return /^(p[xytblr]?-|m[xytblr]?-|w-|h-|flex|grid|text-|bg-|border-|rounded|shadow|sr-only|hidden|block|inline)/.test(className);
}

/**
 * Infer the fill action based on element type.
 */
function inferAction(el: ElementSnapshot): DiscoveredField['suggestedAction'] {
  const tag = el.tagName.toUpperCase();
  const type = (el.type || '').toLowerCase();

  if (tag === 'SELECT') return 'select';
  if (type === 'radio') return 'radio';
  if (type === 'checkbox') return 'checkbox';

  // If it's a text field with autocomplete/suggestion patterns
  const hasAutocomplete = el.ariaLabel?.toLowerCase().includes('search') ||
    el.placeholder?.toLowerCase().includes('search') ||
    el.className?.includes('autocomplete') ||
    el.className?.includes('typeahead');
  if (hasAutocomplete) return 'typeAndSelect';

  return 'type';
}

/**
 * Attempt to infer which UserProfile path a field corresponds to,
 * based on its label, name, and placeholder.
 */
function inferProfilePath(el: ElementSnapshot): string | undefined {
  const hints = [el.label, el.name, el.placeholder, el.ariaLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const mappings: Array<[RegExp, string]> = [
    // Personal
    [/first\s*name/, 'personal.firstName'],
    [/last\s*name|surname|family\s*name/, 'personal.lastName'],
    [/date\s*of\s*birth|dob|birth\s*date/, 'personal.dateOfBirth'],
    [/email/, 'personal.email'],
    [/phone|mobile|contact\s*number/, 'personal.phone'],
    [/address/, 'personal.currentAddress'],

    // Home
    [/property\s*type/, 'home.propertyType'],
    [/construction/, 'home.constructionType'],
    [/roof/, 'home.roofType'],
    [/year\s*built/, 'home.yearBuilt'],
    [/bedroom/, 'home.numberOfBedrooms'],
    [/bathroom/, 'home.numberOfBathrooms'],
    [/storey/, 'home.numberOfStoreys'],
    [/land\s*area|block\s*size/, 'home.landArea'],
    [/swim|pool/, 'home.swimmingPool'],
    [/alarm/, 'home.securityAlarm'],
    [/deadlock/, 'home.deadlocks'],
    [/building\s*sum|building\s*insured/, 'home.buildingSumInsured'],
    [/contents?\s*sum|contents?\s*insured/, 'home.contentsSumInsured'],
    [/excess/, 'home.excessPreference'],

    // Motor
    [/make|manufacturer/, 'motor[0].vehicle.make'],
    [/model/, 'motor[0].vehicle.model'],
    [/year|model\s*year/, 'motor[0].vehicle.year'],
    [/registration|rego/, 'motor[0].vehicle.registration'],
    [/transmission/, 'motor[0].vehicle.transmission'],
    [/fuel/, 'motor[0].vehicle.fuelType'],
    [/colour|color/, 'motor[0].vehicle.colour'],
    [/parking/, 'motor[0].parkingLocation'],
    [/kilomet/, 'motor[0].dailyKilometres'],
  ];

  for (const [pattern, path] of mappings) {
    if (pattern.test(hints)) return path;
  }

  return undefined;
}

/**
 * Sanitise a URL to remove query parameters (potential PII).
 * Preserves hash fragments for SPA routing (e.g. `#!/property-type`).
 * Keeps scheme + host + pathname + hash.
 */
function sanitiseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.hash}`;
  } catch {
    // Strip query params but keep hash
    const [beforeHash, hash] = url.split('#');
    const withoutQuery = beforeHash.split('?')[0];
    return hash ? `${withoutQuery}#${hash}` : withoutQuery;
  }
}

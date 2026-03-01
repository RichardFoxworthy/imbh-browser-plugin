/**
 * Hybrid Automation Engine
 *
 * Extends the original automation engine with auto/assist mode switching.
 *
 * - AUTO mode: follows known adaptor steps, filling fields automatically
 * - ASSIST mode: activated when a step can't be matched; shows an overlay
 *   prompting the user to navigate manually while recording interactions
 *
 * Supports two navigation strategies:
 * - **Sequential**: for adaptors without urlPattern — steps execute in order
 * - **URL-driven**: for SPA forms (e.g. hash-based routing) — detects which
 *   step the page is on after each transition using URL matching
 *
 * When assist mode captures new navigation data, it's queued as a contribution
 * to the central adaptor service so future users benefit.
 */

import { findField, fillField } from './field-matcher';
import { clickNext, waitForPageTransition, detectCaptcha, dismissModals } from './page-navigator';
import { waitForElement, waitForPageStable } from './dom-observer';
import { resolvePath, randomDelay, uid } from '../shared/utils';
import { showAssistOverlay, hideAssistOverlay } from './assist-overlay';
import { buildContribution, analyseRecording } from './interaction-recorder';
import { applyTransform, type TransformSpec } from '../adaptors/transforms';
import type { AdaptorStep, NavigationMode, StepContribution } from '../adaptors/types';
import type { FieldMapping, QuoteResult } from '../adapters/types';
import type { UserProfile } from '../profile/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HybridProgress {
  adaptorId: string;
  adaptorName: string;
  mode: NavigationMode;
  stepIndex: number;
  totalSteps: number;
  stepName: string;
  stepId: string;
  completedSteps: number;
  status: 'running' | 'assist-needed' | 'paused-captcha' | 'completed' | 'error';
  message: string;
  filledFields: number;
  skippedFields: string[];
}

export interface HybridResult {
  success: boolean;
  quote: QuoteResult | null;
  log: LogEntry[];
  contributions: StepContribution[];
  error?: string;
}

export interface LogEntry {
  timestamp: string;
  mode: NavigationMode;
  action: string;
  detail: string;
  success: boolean;
}

export interface SelectorHealthEvent {
  adaptorId: string;
  stepId: string;
  fieldPath: string;
  primarySelector: string;
  primaryWorked: boolean;
  fallbackUsed: string | null;
  labelMatchUsed: boolean;
}

// ---------------------------------------------------------------------------
// URL / step-matching helpers
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 50;

/** Match a URL against a pattern (substring first, then regex fallback). */
function testUrlPattern(url: string, pattern: string): boolean {
  // Fast path: simple substring match
  if (url.includes(pattern)) return true;
  // Regex fallback
  try {
    return new RegExp(pattern).test(url);
  } catch {
    return false;
  }
}

/** Find the first uncompleted step whose urlPattern matches the current URL. */
function matchStepToUrl(
  steps: AdaptorStep[],
  completedStepIds: Set<string>,
  currentUrl: string
): AdaptorStep | null {
  for (const step of steps) {
    if (completedStepIds.has(step.id)) continue;
    if (!step.urlPattern) continue;
    if (testUrlPattern(currentUrl, step.urlPattern)) return step;
  }
  return null;
}

/**
 * Fallback: find the first uncompleted step whose waitForSelector (or
 * fallbackWaitSelectors) matches something in the current DOM.
 * Uses short timeouts to avoid long waits.
 */
async function matchStepBySelector(
  steps: AdaptorStep[],
  completedStepIds: Set<string>
): Promise<AdaptorStep | null> {
  for (const step of steps) {
    if (completedStepIds.has(step.id)) continue;

    // Quick synchronous check first (no waiting)
    const quick = document.querySelector(step.waitForSelector);
    if (quick) return step;

    // Check fallbacks synchronously
    if (step.fallbackWaitSelectors?.length) {
      for (const fb of step.fallbackWaitSelectors) {
        if (document.querySelector(fb)) return step;
      }
    }
  }

  // Second pass with short async waits for dynamic content
  for (const step of steps) {
    if (completedStepIds.has(step.id)) continue;

    const el = await waitForElement(step.waitForSelector, { timeout: 1500 });
    if (el) return step;
  }

  return null;
}

/** Combined: URL match first (fast, no DOM wait), then selector fallback. */
async function detectCurrentStep(
  steps: AdaptorStep[],
  completedStepIds: Set<string>
): Promise<AdaptorStep | null> {
  const currentUrl = window.location.href;

  // Fast: URL-based matching
  const urlMatch = matchStepToUrl(steps, completedStepIds, currentUrl);
  if (urlMatch) return urlMatch;

  // Slow: DOM selector fallback
  return matchStepBySelector(steps, completedStepIds);
}

/**
 * Wait for the URL to change after a navigation action (hash change or
 * pushState). Returns the new URL, or the same URL on timeout.
 */
function waitForUrlChange(previousUrl: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve) => {
    if (window.location.href !== previousUrl) {
      resolve(window.location.href);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    function onUrlChanged() {
      if (window.location.href !== previousUrl) {
        cleanup();
        resolve(window.location.href);
      }
    }

    function cleanup() {
      if (timer) clearTimeout(timer);
      if (pollInterval) clearInterval(pollInterval);
      window.removeEventListener('hashchange', onUrlChanged);
      window.removeEventListener('popstate', onUrlChanged);
    }

    window.addEventListener('hashchange', onUrlChanged);
    window.addEventListener('popstate', onUrlChanged);

    // Also poll briefly — some SPAs don't fire events
    pollInterval = setInterval(() => {
      if (window.location.href !== previousUrl) {
        cleanup();
        resolve(window.location.href);
      }
    }, 200);

    timer = setTimeout(() => {
      cleanup();
      resolve(window.location.href);
    }, timeoutMs);
  });
}

/** Determine if the adaptor is url-driven, sequential, or mixed. */
function classifyAdaptorNavigation(
  steps: AdaptorStep[]
): 'url-driven' | 'sequential' | 'mixed' {
  const withUrl = steps.filter((s) => s.urlPattern).length;
  if (withUrl === 0) return 'sequential';
  if (withUrl === steps.length) return 'url-driven';
  return 'mixed';
}

/** Sanitise URL preserving hash fragments for SPA routing. */
function sanitiseUrlPreserveHash(url: string): string {
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

/** Find the last completed step ID (for contribution ordering). */
function findLastCompletedStepId(
  steps: AdaptorStep[],
  completedStepIds: Set<string>
): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (completedStepIds.has(steps[i].id)) return steps[i].id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main execution function
// ---------------------------------------------------------------------------

export async function executeHybridSteps(
  steps: AdaptorStep[],
  profile: UserProfile,
  adaptorId: string,
  adaptorName: string,
  extractQuote: (doc: Document) => QuoteResult | null,
  onProgress: (progress: HybridProgress) => void,
  onSelectorHealth?: (event: SelectorHealthEvent) => void,
  pluginVersion = '1.0.0'
): Promise<HybridResult> {
  const log: LogEntry[] = [];
  const contributions: StepContribution[] = [];
  let mode: NavigationMode = 'auto';
  const completedStepIds = new Set<string>();

  function addLog(action: string, detail: string, success: boolean) {
    log.push({
      timestamp: new Date().toISOString(),
      mode,
      action,
      detail,
      success,
    });
  }

  function emitProgress(
    stepIdx: number,
    stepName: string,
    status: HybridProgress['status'],
    message: string,
    filledFields = 0,
    skippedFields: string[] = [],
    stepId = ''
  ) {
    onProgress({
      adaptorId,
      adaptorName,
      mode,
      stepIndex: stepIdx,
      totalSteps: steps.length,
      stepName,
      stepId,
      completedSteps: completedStepIds.size,
      status,
      message,
      filledFields,
      skippedFields,
    });
  }

  // Decide strategy
  const navMode = classifyAdaptorNavigation(steps);
  addLog('init', `Navigation mode: ${navMode} (${steps.length} steps)`, true);

  if (navMode === 'sequential') {
    return executeSequentialSteps(
      steps, profile, adaptorId, adaptorName, extractQuote,
      onProgress, onSelectorHealth, pluginVersion,
      log, contributions, mode, completedStepIds, addLog, emitProgress
    );
  }

  // -----------------------------------------------------------------
  // URL-driven / mixed: while-loop with step detection
  // -----------------------------------------------------------------
  let iteration = 0;
  let consecutiveUnknownPages = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // 1. Wait for page to stabilise
    await waitForPageStable(800);

    // 1b. Dismiss any modal/popup overlays blocking the form
    if (dismissModals()) {
      addLog('modal', 'Dismissed blocking modal/popup', true);
      await waitForPageStable(500);
    }

    // 2. Check for CAPTCHA
    if (detectCaptcha()) {
      mode = 'paused-captcha';
      addLog('captcha', 'CAPTCHA detected — pausing for user', true);
      emitProgress(completedStepIds.size, 'CAPTCHA', 'paused-captcha',
        'Please solve the CAPTCHA, then automation will continue.');

      const captchaResolved = await waitForCaptchaResolution(300000);
      if (!captchaResolved) {
        addLog('captcha', 'CAPTCHA timeout', false);
        return { success: false, quote: null, log, contributions, error: 'CAPTCHA not solved in time' };
      }
      mode = 'auto';
      continue;
    }

    // 3. Try to extract quote — we might already be on the results page
    const quote = extractQuote(document);
    if (quote) {
      addLog('extract', `Quote extracted: $${quote.premium.annual}/year`, true);
      emitProgress(completedStepIds.size, 'Complete', 'completed',
        `Quote: $${quote.premium.annual}/year`);
      return { success: true, quote, log, contributions };
    }

    // 4. Detect which step we're on
    const step = await detectCurrentStep(steps, completedStepIds);

    if (!step) {
      // No step matched
      consecutiveUnknownPages++;
      addLog('detect', `No step matched current page (attempt ${consecutiveUnknownPages}/3)`, false);

      if (consecutiveUnknownPages >= 3) {
        // Too many unknowns — enter assist or fail
        const hasFormFields = document.querySelectorAll('input, select, textarea').length > 3;

        if (hasFormFields) {
          addLog('assist', 'Unknown form page after multiple retries — entering assist mode', true);
          mode = 'assist';
          emitProgress(completedStepIds.size, 'Unknown Step', 'assist-needed',
            'We found a page we don\'t recognise. Please fill it out and click Done.');

          const lastStepId = findLastCompletedStepId(steps, completedStepIds);

          const assistResult = await showAssistOverlay({
            adaptorName,
            reason: 'We encountered a form page that doesn\'t match any known step. Please complete it manually.',
          });

          if (assistResult.completed && assistResult.interactions.length > 0) {
            const contribution = buildContribution(adaptorId, lastStepId, assistResult.interactions, pluginVersion);
            contribution.type = 'new_step';
            contributions.push(contribution);
          }

          mode = 'auto';
          consecutiveUnknownPages = 0;
          continue;
        }

        addLog('detect', 'No matching step and no form fields — failing', false);
        emitProgress(completedStepIds.size, 'Unknown', 'error',
          'Could not find a matching step on the current page');
        return {
          success: false, quote: null, log, contributions,
          error: 'No matching step found after multiple attempts',
        };
      }

      // Brief wait then retry
      await randomDelay(1000, 2000);
      continue;
    }

    // Step matched — reset unknown counter
    consecutiveUnknownPages = 0;
    const stepIdx = steps.indexOf(step);
    const lastStepId = findLastCompletedStepId(steps, completedStepIds);

    addLog('detect', `Matched step: ${step.name} (${step.id}) via ${step.urlPattern ? 'URL' : 'selector'}`, true);
    emitProgress(stepIdx, step.name, 'running',
      `Step ${completedStepIds.size + 1}/${steps.length}: ${step.name}`,
      0, [], step.id);

    // 5. Confirm DOM readiness — even if URL matched, the DOM may not be ready yet
    let pageReady = await waitForElement(step.waitForSelector, {
      timeout: step.timeout || 15000,
    });

    if (!pageReady && step.fallbackWaitSelectors?.length) {
      for (const fallback of step.fallbackWaitSelectors) {
        pageReady = await waitForElement(fallback, { timeout: 5000 });
        if (pageReady) {
          addLog('wait', `Primary selector failed, fallback matched: ${fallback}`, true);
          break;
        }
      }
    }

    if (!pageReady) {
      // URL matched but DOM didn't — assist for this step
      addLog('assist', `Step "${step.name}" URL matched but DOM not ready, entering assist mode`, true);
      mode = 'assist';
      emitProgress(stepIdx, step.name, 'assist-needed',
        `We need your help with: ${step.name}`, 0, [], step.id);

      const assistResult = await showAssistOverlay({
        adaptorName,
        stepName: step.name,
        reason: `We detected the "${step.name}" page but the expected form fields weren't found.`,
      });

      if (assistResult.completed && assistResult.interactions.length > 0) {
        const contribution = buildContribution(adaptorId, lastStepId, assistResult.interactions, pluginVersion);
        contribution.stepId = step.id;
        contribution.type = 'update';
        contributions.push(contribution);
      }

      mode = 'auto';
      completedStepIds.add(step.id);
      continue;
    }

    // 6. AUTO mode: fill fields
    await waitForPageStable(800);

    const { filledCount, skippedFields } = await fillStepFields(
      step, profile, adaptorId, onSelectorHealth, addLog
    );

    emitProgress(stepIdx, step.name, 'running',
      `Filled ${filledCount}/${step.fields.length} fields`,
      filledCount, skippedFields, step.id);

    // 7. High failure rate → assist mode
    const failRate = step.fields.length > 0
      ? skippedFields.length / step.fields.length
      : 0;

    if (failRate > 0.5 && step.fields.length > 2) {
      addLog('assist', `High field failure rate (${Math.round(failRate * 100)}%), offering assist mode`, true);
      mode = 'assist';

      emitProgress(stepIdx, step.name, 'assist-needed',
        `Some fields couldn't be filled automatically. Please complete the remaining fields.`,
        filledCount, skippedFields, step.id);

      const assistResult = await showAssistOverlay({
        adaptorName,
        stepName: step.name,
        reason: `${skippedFields.length} of ${step.fields.length} fields couldn't be filled automatically. Please complete the missing fields.`,
      });

      if (assistResult.completed && assistResult.interactions.length > 0) {
        const contribution = buildContribution(adaptorId, lastStepId, assistResult.interactions, pluginVersion);
        contribution.stepId = step.id;
        contribution.type = 'update';
        contributions.push(contribution);
      }

      mode = 'auto';
    }

    // 8. Mark step completed, record verification contribution
    completedStepIds.add(step.id);

    if (failRate <= 0.2) {
      contributions.push({
        adaptorId,
        stepId: step.id,
        type: 'verification',
        timestamp: new Date().toISOString(),
        pluginVersion,
        pageUrl: sanitiseUrlPreserveHash(window.location.href),
        pageTitle: document.title,
      });
    }

    // 9. Navigate: click next, wait for URL change + page stable
    if (step.nextAction) {
      const urlBefore = window.location.href;
      addLog('navigate', `Clicking next: ${step.nextAction.selector || 'auto-detect'}`, true);
      await randomDelay(1000, 3000);
      const clicked = await clickNext(step.nextAction.selector);
      if (!clicked) {
        addLog('navigate', 'Could not find next button', false);
      }

      // Wait for URL change (SPA) + page transition
      await waitForUrlChange(urlBefore, step.timeout || 15000);
      await waitForPageTransition(step.timeout || 15000);
      await randomDelay(3000, 8000);
    } else {
      // No explicit nextAction — auto-advancing step (e.g. button-select).
      // The click during field-fill likely changed the URL already.
      // Brief wait for the SPA to settle, then loop re-detects.
      await randomDelay(1000, 3000);
      await waitForPageStable(1500);
    }

    // 10. Loop back to top — re-detect step from new URL
  }

  // Exhausted iterations
  addLog('error', `Reached maximum iterations (${MAX_ITERATIONS})`, false);
  emitProgress(completedStepIds.size, 'Error', 'error', 'Automation loop exceeded maximum iterations');
  return {
    success: false, quote: null, log, contributions,
    error: `Exceeded maximum iterations (${MAX_ITERATIONS})`,
  };
}

// ---------------------------------------------------------------------------
// Sequential execution (preserves original for-loop behaviour)
// ---------------------------------------------------------------------------

async function executeSequentialSteps(
  steps: AdaptorStep[],
  profile: UserProfile,
  adaptorId: string,
  adaptorName: string,
  extractQuote: (doc: Document) => QuoteResult | null,
  onProgress: (progress: HybridProgress) => void,
  onSelectorHealth: ((event: SelectorHealthEvent) => void) | undefined,
  pluginVersion: string,
  log: LogEntry[],
  contributions: StepContribution[],
  mode: NavigationMode,
  completedStepIds: Set<string>,
  addLog: (action: string, detail: string, success: boolean) => void,
  emitProgress: (
    stepIdx: number, stepName: string, status: HybridProgress['status'],
    message: string, filledFields?: number, skippedFields?: string[], stepId?: string
  ) => void
): Promise<HybridResult> {

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    const prevStepId = stepIdx > 0 ? steps[stepIdx - 1].id : null;

    emitProgress(stepIdx, step.name, 'running',
      `Step ${stepIdx + 1}/${steps.length}: ${step.name}`, 0, [], step.id);

    // ------------------------------------------------------------------
    // Try to match the current page to the expected step
    // ------------------------------------------------------------------
    addLog('wait', `Waiting for step: ${step.name} (${step.waitForSelector})`, true);

    let pageReady = await waitForElement(step.waitForSelector, {
      timeout: step.timeout || 15000,
    });

    // Try fallback wait selectors
    if (!pageReady && step.fallbackWaitSelectors?.length) {
      for (const fallback of step.fallbackWaitSelectors) {
        pageReady = await waitForElement(fallback, { timeout: 5000 });
        if (pageReady) {
          addLog('wait', `Primary wait selector failed, fallback matched: ${fallback}`, true);
          break;
        }
      }
    }

    // ------------------------------------------------------------------
    // If page doesn't match: switch to ASSIST mode
    // ------------------------------------------------------------------
    if (!pageReady) {
      if (step.confidence < 0.3) {
        addLog('assist', `Step "${step.name}" has low confidence (${step.confidence}), entering assist mode`, true);
      } else {
        addLog('assist', `Step "${step.name}" not found on page, entering assist mode`, true);
      }

      mode = 'assist';
      emitProgress(stepIdx, step.name, 'assist-needed',
        `We need your help with: ${step.name}`, 0, [], step.id);

      const assistResult = await showAssistOverlay({
        adaptorName,
        stepName: step.name,
        reason: `The form layout appears to have changed. We couldn't find the expected "${step.name}" section.`,
      });

      if (assistResult.completed && assistResult.interactions.length > 0) {
        const contribution = buildContribution(
          adaptorId,
          prevStepId,
          assistResult.interactions,
          pluginVersion
        );
        contribution.stepId = step.id;
        contribution.type = 'update';
        contributions.push(contribution);

        addLog('assist', `User completed assist mode, captured ${assistResult.interactions.length} interactions`, true);
      } else {
        addLog('assist', 'User skipped this step', false);
      }

      mode = 'auto';
      completedStepIds.add(step.id);
      continue;
    }

    // ------------------------------------------------------------------
    // AUTO mode: fill fields
    // ------------------------------------------------------------------
    await waitForPageStable(800);

    // Dismiss any modal/popup overlays blocking the form
    if (dismissModals()) {
      addLog('modal', 'Dismissed blocking modal/popup', true);
      await waitForPageStable(500);
    }

    // Check for CAPTCHA
    if (detectCaptcha()) {
      mode = 'paused-captcha';
      addLog('captcha', 'CAPTCHA detected — pausing for user', true);
      emitProgress(stepIdx, step.name, 'paused-captcha',
        'Please solve the CAPTCHA, then automation will continue.', 0, [], step.id);

      const captchaResolved = await waitForCaptchaResolution(300000);
      if (!captchaResolved) {
        addLog('captcha', 'CAPTCHA timeout', false);
        return { success: false, quote: null, log, contributions, error: 'CAPTCHA not solved in time' };
      }
      mode = 'auto';
    }

    // Fill fields
    const { filledCount, skippedFields } = await fillStepFields(
      step, profile, adaptorId, onSelectorHealth, addLog
    );

    emitProgress(stepIdx, step.name, 'running',
      `Filled ${filledCount}/${step.fields.length} fields`,
      filledCount, skippedFields, step.id);

    // If too many fields failed, consider switching to assist for this step
    const failRate = step.fields.length > 0
      ? skippedFields.length / step.fields.length
      : 0;

    if (failRate > 0.5 && step.fields.length > 2) {
      addLog('assist', `High field failure rate (${Math.round(failRate * 100)}%), offering assist mode`, true);
      mode = 'assist';

      emitProgress(stepIdx, step.name, 'assist-needed',
        `Some fields couldn't be filled automatically. Please complete the remaining fields.`,
        filledCount, skippedFields, step.id);

      const assistResult = await showAssistOverlay({
        adaptorName,
        stepName: step.name,
        reason: `${skippedFields.length} of ${step.fields.length} fields couldn't be filled automatically. Please complete the missing fields.`,
      });

      if (assistResult.completed && assistResult.interactions.length > 0) {
        const contribution = buildContribution(adaptorId, prevStepId, assistResult.interactions, pluginVersion);
        contribution.stepId = step.id;
        contribution.type = 'update';
        contributions.push(contribution);
      }

      mode = 'auto';
    }

    // Mark step completed
    completedStepIds.add(step.id);

    // Queue a verification if the step worked well
    if (failRate <= 0.2) {
      contributions.push({
        adaptorId,
        stepId: step.id,
        type: 'verification',
        timestamp: new Date().toISOString(),
        pluginVersion,
        pageUrl: sanitiseUrlPreserveHash(window.location.href),
        pageTitle: document.title,
      });
    }

    // Navigate to next step
    if (step.nextAction) {
      addLog('navigate', `Clicking next: ${step.nextAction.selector || 'auto-detect'}`, true);
      await randomDelay(1000, 3000);
      const clicked = await clickNext(step.nextAction.selector);
      if (!clicked) {
        addLog('navigate', 'Could not find next button', false);
      }

      await waitForPageTransition(step.timeout || 15000);
      await randomDelay(3000, 8000);
    }
  }

  // ------------------------------------------------------------------
  // Check for unexpected new pages (not covered by any step)
  // ------------------------------------------------------------------
  await waitForPageStable(2000);

  let quote = extractQuote(document);

  if (!quote) {
    const hasFormFields = document.querySelectorAll('input, select, textarea').length > 3;

    if (hasFormFields) {
      addLog('assist', 'Unexpected form page after all known steps — entering assist mode', true);
      mode = 'assist';

      emitProgress(steps.length, 'Unknown Step', 'assist-needed',
        'There appears to be an additional step we don\'t expect.', 0, []);

      const lastStepId = findLastCompletedStepId(steps, completedStepIds);

      const assistResult = await showAssistOverlay({
        adaptorName,
        reason: 'We\'ve completed all known steps, but there\'s an extra page. Please fill it out and click Done.',
      });

      if (assistResult.completed && assistResult.interactions.length > 0) {
        const contribution = buildContribution(adaptorId, lastStepId, assistResult.interactions, pluginVersion);
        contribution.type = 'new_step';
        contributions.push(contribution);
      }

      mode = 'auto';

      await waitForPageStable(2000);
      quote = extractQuote(document);
    }
  }

  // ------------------------------------------------------------------
  // Extract quote
  // ------------------------------------------------------------------
  if (quote) {
    addLog('extract', `Quote extracted: $${quote.premium.annual}/year`, true);
    emitProgress(steps.length, 'Complete', 'completed', `Quote: $${quote.premium.annual}/year`);
    return { success: true, quote, log, contributions };
  } else {
    addLog('extract', 'Could not extract quote from page', false);
    emitProgress(steps.length, 'Complete', 'error', 'Could not extract quote from the results page');
    return { success: false, quote: null, log, contributions, error: 'Quote extraction failed' };
  }
}

// ---------------------------------------------------------------------------
// Shared: fill all fields for a step
// ---------------------------------------------------------------------------

async function fillStepFields(
  step: AdaptorStep,
  profile: UserProfile,
  adaptorId: string,
  onSelectorHealth: ((event: SelectorHealthEvent) => void) | undefined,
  addLog: (action: string, detail: string, success: boolean) => void
): Promise<{ filledCount: number; skippedFields: string[] }> {
  const skippedFields: string[] = [];
  let filledCount = 0;

  for (const fieldMapping of step.fields) {
    const rawValue = resolvePath(profile as any, fieldMapping.profilePath);
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      skippedFields.push(fieldMapping.profilePath);
      addLog('field', `Skipped ${fieldMapping.profilePath} — no value in profile`, false);
      continue;
    }

    // Apply transform (declarative or legacy string)
    let value: string;
    if (fieldMapping.transform && typeof fieldMapping.transform === 'object') {
      value = applyTransform(rawValue, fieldMapping.transform as unknown as TransformSpec);
    } else if (typeof fieldMapping.transform === 'string') {
      // Legacy string transform — kept for backward compatibility with seed data
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('return ' + fieldMapping.transform)();
        value = fn(rawValue);
      } catch {
        value = String(rawValue);
      }
    } else {
      value = String(rawValue);
    }

    // Find the field element — track which selector strategy worked
    const fieldEl = await findField(fieldMapping);
    let primaryWorked = false;
    let fallbackUsed: string | null = null;
    let labelMatchUsed = false;

    if (fieldEl) {
      const primaryMatch = document.querySelector(fieldMapping.selector);
      if (primaryMatch === fieldEl) {
        primaryWorked = true;
      } else {
        for (const fb of fieldMapping.fallbackSelectors || []) {
          const fbMatch = document.querySelector(fb);
          if (fbMatch === fieldEl) {
            fallbackUsed = fb;
            break;
          }
        }
        if (!fallbackUsed) {
          labelMatchUsed = true;
        }
      }

      onSelectorHealth?.({
        adaptorId,
        stepId: step.id,
        fieldPath: fieldMapping.profilePath,
        primarySelector: fieldMapping.selector,
        primaryWorked,
        fallbackUsed,
        labelMatchUsed,
      });
    }

    if (!fieldEl) {
      skippedFields.push(fieldMapping.profilePath);
      addLog('field', `Could not find field for ${fieldMapping.profilePath}`, false);

      onSelectorHealth?.({
        adaptorId,
        stepId: step.id,
        fieldPath: fieldMapping.profilePath,
        primarySelector: fieldMapping.selector,
        primaryWorked: false,
        fallbackUsed: null,
        labelMatchUsed: false,
      });
      continue;
    }

    const filled = await fillField(fieldEl, value, fieldMapping.action);
    if (filled) {
      filledCount++;
      addLog('field', `Filled ${fieldMapping.profilePath}`, true);
    } else {
      skippedFields.push(fieldMapping.profilePath);
      addLog('field', `Failed to fill ${fieldMapping.profilePath}`, false);
    }

    await randomDelay(500, 2000);
  }

  return { filledCount, skippedFields };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForCaptchaResolution(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    if (!detectCaptcha()) return true;
  }
  return false;
}

/**
 * Hybrid Automation Engine
 *
 * Extends the original automation engine with auto/assist mode switching.
 *
 * - AUTO mode: follows known adaptor steps, filling fields automatically
 * - ASSIST mode: activated when a step can't be matched; shows an overlay
 *   prompting the user to navigate manually while recording interactions
 *
 * When assist mode captures new navigation data, it's queued as a contribution
 * to the central adaptor service so future users benefit.
 */

import { findField, fillField } from './field-matcher';
import { clickNext, waitForPageTransition, detectCaptcha } from './page-navigator';
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
    skippedFields: string[] = []
  ) {
    onProgress({
      adaptorId,
      adaptorName,
      mode,
      stepIndex: stepIdx,
      totalSteps: steps.length,
      stepName,
      status,
      message,
      filledFields,
      skippedFields,
    });
  }

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    const prevStepId = stepIdx > 0 ? steps[stepIdx - 1].id : null;

    emitProgress(stepIdx, step.name, 'running', `Step ${stepIdx + 1}/${steps.length}: ${step.name}`);

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
      emitProgress(stepIdx, step.name, 'assist-needed', `We need your help with: ${step.name}`);

      const assistResult = await showAssistOverlay({
        adaptorName,
        stepName: step.name,
        reason: `The form layout appears to have changed. We couldn't find the expected "${step.name}" section.`,
      });

      if (assistResult.completed && assistResult.interactions.length > 0) {
        // Build a contribution from the user's interactions
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
      continue;
    }

    // ------------------------------------------------------------------
    // AUTO mode: fill fields
    // ------------------------------------------------------------------
    await waitForPageStable(800);

    // Check for CAPTCHA
    if (detectCaptcha()) {
      mode = 'paused-captcha';
      addLog('captcha', 'CAPTCHA detected — pausing for user', true);
      emitProgress(stepIdx, step.name, 'paused-captcha', 'Please solve the CAPTCHA, then automation will continue.');

      const captchaResolved = await waitForCaptchaResolution(300000);
      if (!captchaResolved) {
        addLog('captcha', 'CAPTCHA timeout', false);
        return { success: false, quote: null, log, contributions, error: 'CAPTCHA not solved in time' };
      }
      mode = 'auto';
    }

    // Fill fields
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
        // Determine which strategy matched (approximate — findField is opaque)
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

        // Report selector health
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

        // Report the failure
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

    emitProgress(stepIdx, step.name, 'running', `Filled ${filledCount}/${step.fields.length} fields`, filledCount, skippedFields);

    // If too many fields failed, consider switching to assist for this step
    const failRate = step.fields.length > 0
      ? skippedFields.length / step.fields.length
      : 0;

    if (failRate > 0.5 && step.fields.length > 2) {
      addLog('assist', `High field failure rate (${Math.round(failRate * 100)}%), offering assist mode`, true);
      mode = 'assist';

      emitProgress(stepIdx, step.name, 'assist-needed',
        `Some fields couldn't be filled automatically. Please complete the remaining fields.`);

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

    // Queue a verification if the step worked well
    if (failRate <= 0.2) {
      contributions.push({
        adaptorId,
        stepId: step.id,
        type: 'verification',
        timestamp: new Date().toISOString(),
        pluginVersion,
        pageUrl: sanitiseUrl(window.location.href),
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

  // If we're not on a quote results page, there might be extra steps
  let quote = extractQuote(document);

  if (!quote) {
    // Check if we're still in a form — might be an unknown extra step
    const hasFormFields = document.querySelectorAll('input, select, textarea').length > 3;

    if (hasFormFields) {
      addLog('assist', 'Unexpected form page after all known steps — entering assist mode', true);
      mode = 'assist';

      emitProgress(steps.length, 'Unknown Step', 'assist-needed',
        'There appears to be an additional step we didn\'t expect.');

      const lastStepId = steps.length > 0 ? steps[steps.length - 1].id : null;

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

      // Try extracting quote again after user's manual navigation
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

function sanitiseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

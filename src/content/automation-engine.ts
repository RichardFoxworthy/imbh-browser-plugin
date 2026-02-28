/**
 * Core automation engine. Executes adapter steps in the user's browser,
 * filling form fields and navigating through multi-step insurance quote forms.
 *
 * Designed to be resilient:
 * - Handles dynamic/conditional form fields
 * - Detects CAPTCHAs and pauses for user intervention
 * - Logs every action for user transparency
 * - Sends progress updates to the background service worker
 */

import { findField, fillField } from './field-matcher';
import { clickNext, waitForPageTransition, detectCaptcha } from './page-navigator';
import { waitForElement, waitForPageStable } from './dom-observer';
import { resolvePath, randomDelay } from '../shared/utils';
import type { AdapterStep, FieldMapping, QuoteResult } from '../adapters/types';
import type { UserProfile } from '../profile/types';

export interface AutomationProgress {
  adapterId: string;
  stepIndex: number;
  totalSteps: number;
  stepName: string;
  status: 'running' | 'paused-captcha' | 'paused-unknown-field' | 'completed' | 'error';
  message: string;
  filledFields: number;
  skippedFields: string[];
}

export interface AutomationResult {
  success: boolean;
  quote: QuoteResult | null;
  log: AutomationLogEntry[];
  error?: string;
}

export interface AutomationLogEntry {
  timestamp: string;
  action: string;
  detail: string;
  success: boolean;
}

/**
 * Execute a sequence of adapter steps to fill an insurance quote form
 * and extract the resulting quote.
 */
export async function executeAdapterSteps(
  steps: AdapterStep[],
  profile: UserProfile,
  adapterId: string,
  extractQuote: (doc: Document) => QuoteResult | null,
  onProgress: (progress: AutomationProgress) => void
): Promise<AutomationResult> {
  const log: AutomationLogEntry[] = [];

  function addLog(action: string, detail: string, success: boolean) {
    log.push({ timestamp: new Date().toISOString(), action, detail, success });
  }

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];

    onProgress({
      adapterId,
      stepIndex: stepIdx,
      totalSteps: steps.length,
      stepName: step.name,
      status: 'running',
      message: `Step ${stepIdx + 1}/${steps.length}: ${step.name}`,
      filledFields: 0,
      skippedFields: [],
    });

    // Wait for the page/section to be ready
    addLog('wait', `Waiting for step: ${step.name} (${step.waitForSelector})`, true);
    const pageReady = await waitForElement(step.waitForSelector, {
      timeout: step.timeout || 15000,
    });

    if (!pageReady) {
      addLog('wait', `Step element not found: ${step.waitForSelector}`, false);
      // Page might have skipped this step — continue to next
      continue;
    }

    await waitForPageStable(800);

    // Check for CAPTCHA
    if (detectCaptcha()) {
      addLog('captcha', 'CAPTCHA detected — pausing for user', true);
      onProgress({
        adapterId,
        stepIndex: stepIdx,
        totalSteps: steps.length,
        stepName: step.name,
        status: 'paused-captcha',
        message: 'Please solve the CAPTCHA, then the automation will continue.',
        filledFields: 0,
        skippedFields: [],
      });

      // Wait for CAPTCHA to be resolved (poll every 2s, up to 5 minutes)
      const captchaResolved = await waitForCaptchaResolution(300000);
      if (!captchaResolved) {
        addLog('captcha', 'CAPTCHA timeout', false);
        return { success: false, quote: null, log, error: 'CAPTCHA not solved in time' };
      }
    }

    // Fill fields for this step
    const skippedFields: string[] = [];
    let filledCount = 0;

    for (const fieldMapping of step.fields) {
      // Resolve the value from the user's profile
      const rawValue = resolvePath(profile as any, fieldMapping.profilePath);
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        skippedFields.push(fieldMapping.profilePath);
        addLog('field', `Skipped ${fieldMapping.profilePath} — no value in profile`, false);
        continue;
      }

      const value = typeof fieldMapping.transform === 'function'
        ? fieldMapping.transform(rawValue)
        : String(rawValue);

      // Find the field element
      const fieldEl = await findField(fieldMapping);
      if (!fieldEl) {
        skippedFields.push(fieldMapping.profilePath);
        addLog('field', `Could not find field for ${fieldMapping.profilePath}`, false);
        continue;
      }

      // Fill the field
      const filled = await fillField(fieldEl, value, fieldMapping.action);
      if (filled) {
        filledCount++;
        addLog('field', `Filled ${fieldMapping.profilePath} = "${value}"`, true);
      } else {
        skippedFields.push(fieldMapping.profilePath);
        addLog('field', `Failed to fill ${fieldMapping.profilePath}`, false);
      }

      // Human-like delay between fields
      await randomDelay(500, 2000);
    }

    onProgress({
      adapterId,
      stepIndex: stepIdx,
      totalSteps: steps.length,
      stepName: step.name,
      status: 'running',
      message: `Filled ${filledCount}/${step.fields.length} fields`,
      filledFields: filledCount,
      skippedFields,
    });

    // Navigate to next step
    if (step.nextAction) {
      addLog('navigate', `Clicking next: ${step.nextAction.selector || 'auto-detect'}`, true);
      await randomDelay(1000, 3000);
      const clicked = await clickNext(step.nextAction.selector);
      if (!clicked) {
        addLog('navigate', 'Could not find next button', false);
      }

      // Wait for page transition
      await waitForPageTransition(step.timeout || 15000);
      // Extra polite delay between pages
      await randomDelay(3000, 8000);
    }
  }

  // Extract quote from the final page
  await waitForPageStable(2000);
  const quote = extractQuote(document);

  if (quote) {
    addLog('extract', `Quote extracted: $${quote.premium.annual}/year`, true);
    onProgress({
      adapterId,
      stepIndex: steps.length,
      totalSteps: steps.length,
      stepName: 'Complete',
      status: 'completed',
      message: `Quote: $${quote.premium.annual}/year`,
      filledFields: 0,
      skippedFields: [],
    });
    return { success: true, quote, log };
  } else {
    addLog('extract', 'Could not extract quote from page', false);
    onProgress({
      adapterId,
      stepIndex: steps.length,
      totalSteps: steps.length,
      stepName: 'Complete',
      status: 'error',
      message: 'Could not extract quote from the results page',
      filledFields: 0,
      skippedFields: [],
    });
    return { success: false, quote: null, log, error: 'Quote extraction failed' };
  }
}

/** Poll for CAPTCHA resolution. */
async function waitForCaptchaResolution(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    if (!detectCaptcha()) return true;
  }
  return false;
}

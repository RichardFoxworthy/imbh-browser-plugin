/**
 * Content script entry point.
 * Injected into insurer websites. Listens for commands from the background
 * service worker and executes form automation.
 *
 * Supports three automation paths:
 * - START_AUTOMATION: legacy path using static TypeScript adapters
 * - START_HYBRID_AUTOMATION: crowdsourced JSON adaptors with auto/assist mode
 * - START_DISCOVERY: zero-knowledge full-form discovery for new insurers
 */

import { executeAdapterSteps } from './automation-engine';
import { executeHybridSteps } from './hybrid-automation-engine';
import { startDiscovery } from './discovery-engine';
import { showDiscoveryOverlay, hideDiscoveryOverlay } from './discovery-overlay';
import type { AdapterStep, QuoteResult } from '../adapters/types';
import type { AdaptorStep, ExtractionRules, StepContribution, DiscoverySession } from '../adaptors/types';
import type { UserProfile } from '../profile/types';
import type { AutomationProgress } from './automation-engine';
import type { HybridProgress, SelectorHealthEvent } from './hybrid-automation-engine';
import type { DiscoveryProgress } from './discovery-engine';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface StartAutomationMessage {
  type: 'START_AUTOMATION';
  adapterId: string;
  steps: AdapterStep[];
  profile: UserProfile;
}

interface StartHybridAutomationMessage {
  type: 'START_HYBRID_AUTOMATION';
  adaptorId: string;
  adaptorName: string;
  steps: AdaptorStep[];
  extractionRules: ExtractionRules;
  profile: UserProfile;
}

interface StartDiscoveryMessage {
  type: 'START_DISCOVERY';
  adaptorId: string;
  adaptorName: string;
}

interface PingMessage {
  type: 'PING';
}

type IncomingMessage =
  | StartAutomationMessage
  | StartHybridAutomationMessage
  | StartDiscoveryMessage
  | PingMessage;

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ type: 'PONG' });
      return false;
    }

    if (message.type === 'START_AUTOMATION') {
      handleLegacyAutomation(message).then(sendResponse);
      return true;
    }

    if (message.type === 'START_HYBRID_AUTOMATION') {
      handleHybridAutomation(message).then(sendResponse);
      return true;
    }

    if (message.type === 'START_DISCOVERY') {
      handleDiscovery(message).then(sendResponse);
      return true;
    }

    return false;
  }
);

// ---------------------------------------------------------------------------
// Hybrid automation (crowdsourced JSON adaptors)
// ---------------------------------------------------------------------------

async function handleHybridAutomation(
  message: StartHybridAutomationMessage
): Promise<{ success: boolean; quote: QuoteResult | null; contributions: StepContribution[]; error?: string }> {
  const { adaptorId, adaptorName, steps, extractionRules, profile } = message;

  function extractQuote(doc: Document): QuoteResult | null {
    // Try adaptor-specific extraction rules first
    const ruleResult = extractWithRules(doc, extractionRules, adaptorName);
    if (ruleResult) return ruleResult;
    // Fall back to generic extraction
    return extractQuoteFromPage();
  }

  function onProgress(progress: HybridProgress) {
    chrome.runtime.sendMessage({
      type: 'AUTOMATION_PROGRESS',
      adapterId: progress.adaptorId,
      stepIndex: progress.stepIndex,
      totalSteps: progress.totalSteps,
      stepName: progress.stepName,
      status: progress.status === 'assist-needed' ? 'paused-unknown-field' : progress.status,
      message: progress.message,
      filledFields: progress.filledFields,
      skippedFields: progress.skippedFields,
      mode: progress.mode,
    });
  }

  function onSelectorHealth(event: SelectorHealthEvent) {
    chrome.runtime.sendMessage({
      type: 'SELECTOR_HEALTH',
      ...event,
    });
  }

  try {
    const result = await executeHybridSteps(
      steps,
      profile,
      adaptorId,
      adaptorName,
      extractQuote,
      onProgress,
      onSelectorHealth
    );

    // Submit any contributions collected during the run
    if (result.contributions.length > 0) {
      chrome.runtime.sendMessage({
        type: 'SUBMIT_CONTRIBUTIONS',
        contributions: result.contributions,
      });
    }

    return {
      success: result.success,
      quote: result.quote,
      contributions: result.contributions,
      error: result.error,
    };
  } catch (err) {
    return {
      success: false,
      quote: null,
      contributions: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Discovery mode (zero-knowledge bootstrapping)
// ---------------------------------------------------------------------------

async function handleDiscovery(
  message: StartDiscoveryMessage
): Promise<{ success: boolean; session: DiscoverySession | null; error?: string }> {
  const { adaptorId, adaptorName } = message;

  function onProgress(progress: DiscoveryProgress) {
    chrome.runtime.sendMessage({
      type: 'DISCOVERY_PROGRESS',
      adaptorId: progress.adaptorId,
      adaptorName: progress.adaptorName,
      stepCount: progress.stepCount,
      status: progress.status,
      message: progress.message,
      currentPageUrl: progress.currentPageUrl,
    });
  }

  try {
    // Show the discovery overlay UI
    showDiscoveryOverlay(adaptorName);

    // Start the discovery engine — this resolves when the user
    // completes the entire form or cancels
    const result = await startDiscovery({
      adaptorId,
      adaptorName,
      onProgress,
    });

    hideDiscoveryOverlay();

    if (result.cancelled || !result.session) {
      return { success: false, session: null, error: 'Discovery cancelled' };
    }

    // Submit the full discovery session to the background service worker
    chrome.runtime.sendMessage({
      type: 'SUBMIT_DISCOVERY',
      session: result.session,
    });

    return { success: true, session: result.session };
  } catch (err) {
    hideDiscoveryOverlay();
    return {
      success: false,
      session: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Legacy automation (static TypeScript adapters)
// ---------------------------------------------------------------------------

async function handleLegacyAutomation(
  message: StartAutomationMessage
): Promise<{ success: boolean; quote: QuoteResult | null; error?: string }> {
  const { adapterId, steps, profile } = message;

  const hydratedSteps = steps.map((step) => ({
    ...step,
    fields: step.fields.map((f) => ({
      ...f,
      transform: f.transform ? new Function('return ' + f.transform)() : undefined,
    })),
  }));

  function onProgress(progress: AutomationProgress) {
    chrome.runtime.sendMessage({
      type: 'AUTOMATION_PROGRESS',
      ...progress,
    });
  }

  try {
    const result = await executeAdapterSteps(
      hydratedSteps,
      profile,
      adapterId,
      (_doc) => extractQuoteFromPage(),
      onProgress
    );

    return {
      success: result.success,
      quote: result.quote,
      error: result.error,
    };
  } catch (err) {
    return {
      success: false,
      quote: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Quote extraction
// ---------------------------------------------------------------------------

/**
 * Extract a quote using adaptor-specific extraction rules.
 */
function extractWithRules(
  doc: Document,
  rules: ExtractionRules,
  providerName: string
): QuoteResult | null {
  let premiumText: string | null = null;
  for (const sel of rules.premiumSelectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent) {
      premiumText = el.textContent;
      break;
    }
  }
  if (!premiumText) return null;

  const premiumMatch = premiumText.match(/\$?([\d,]+(?:\.\d{2})?)/);
  if (!premiumMatch) return null;
  const annual = parseFloat(premiumMatch[1].replace(/,/g, ''));

  let excess = 0;
  for (const sel of rules.excessSelectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent) {
      const m = el.textContent.match(/\$?([\d,]+)/);
      if (m) excess = parseFloat(m[1].replace(/,/g, ''));
      break;
    }
  }

  const inclusions: string[] = [];
  for (const sel of rules.inclusionSelectors) {
    doc.querySelectorAll(sel).forEach((el) => {
      if (el.textContent) inclusions.push(el.textContent.trim());
    });
    if (inclusions.length > 0) break;
  }

  const exclusions: string[] = [];
  for (const sel of rules.exclusionSelectors || []) {
    doc.querySelectorAll(sel).forEach((el) => {
      if (el.textContent) exclusions.push(el.textContent.trim());
    });
    if (exclusions.length > 0) break;
  }

  return {
    provider: providerName,
    product: '',
    premium: { annual },
    excess,
    inclusions,
    exclusions,
    retrievedAt: new Date().toISOString(),
    sourceUrl: doc.location?.href || '',
    raw: { premiumText: premiumText || '' },
  };
}

/**
 * Generic quote extraction — looks for common price patterns on the page.
 */
function extractQuoteFromPage(): QuoteResult | null {
  const pricePattern = /\$[\d,]+(?:\.\d{2})?/g;
  const bodyText = document.body.innerText;
  const prices = bodyText.match(pricePattern);

  if (!prices || prices.length === 0) return null;

  const parsedPrices = prices
    .map((p) => parseFloat(p.replace(/[$,]/g, '')))
    .filter((p) => p > 50 && p < 50000)
    .sort((a, b) => a - b);

  if (parsedPrices.length === 0) return null;

  return {
    provider: document.title || 'Unknown',
    product: '',
    premium: { annual: parsedPrices[0] },
    excess: 0,
    inclusions: [],
    exclusions: [],
    retrievedAt: new Date().toISOString(),
    sourceUrl: window.location.href,
    raw: {},
  };
}

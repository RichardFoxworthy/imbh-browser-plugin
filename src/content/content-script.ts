/**
 * Content script entry point.
 * Injected into insurer websites. Listens for commands from the background
 * service worker and executes form automation.
 */

import { executeAdapterSteps } from './automation-engine';
import type { AdapterStep, QuoteResult } from '../adapters/types';
import type { UserProfile } from '../profile/types';
import type { AutomationProgress } from './automation-engine';

interface StartAutomationMessage {
  type: 'START_AUTOMATION';
  adapterId: string;
  steps: AdapterStep[];
  profile: UserProfile;
}

interface PingMessage {
  type: 'PING';
}

type IncomingMessage = StartAutomationMessage | PingMessage;

// Listen for messages from the background service worker
chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ type: 'PONG' });
      return false;
    }

    if (message.type === 'START_AUTOMATION') {
      handleAutomation(message).then(sendResponse);
      return true; // Keep the message channel open for async response
    }

    return false;
  }
);

async function handleAutomation(
  message: StartAutomationMessage
): Promise<{ success: boolean; quote: QuoteResult | null; error?: string }> {
  const { adapterId, steps, profile } = message;

  // Deserialise steps — transform functions are serialised as strings
  const hydratedSteps = steps.map((step) => ({
    ...step,
    fields: step.fields.map((f) => ({
      ...f,
      // Transform functions can't be serialised, so adapters should use
      // simple string transforms that are re-evaluated here
      transform: f.transform ? new Function('return ' + f.transform)() : undefined,
    })),
  }));

  function onProgress(progress: AutomationProgress) {
    // Forward progress to background service worker
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
      // The extractQuote function needs to be run here in the content script context.
      // We'll use a generic extractor — specific extractors are defined in adapters
      // and sent as part of the step definitions.
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

/**
 * Generic quote extraction — looks for common price patterns on the page.
 * Adapters can override this with specific selectors.
 */
function extractQuoteFromPage(): QuoteResult | null {
  // Look for price-like patterns in the visible page
  const pricePattern = /\$[\d,]+(?:\.\d{2})?/g;
  const bodyText = document.body.innerText;
  const prices = bodyText.match(pricePattern);

  if (!prices || prices.length === 0) return null;

  // Parse all found prices
  const parsedPrices = prices
    .map((p) => parseFloat(p.replace(/[$,]/g, '')))
    .filter((p) => p > 50 && p < 50000) // Reasonable insurance premium range
    .sort((a, b) => a - b);

  if (parsedPrices.length === 0) return null;

  // The main premium is typically the most prominent price
  const premium = parsedPrices[0];

  return {
    provider: document.title || 'Unknown',
    product: '',
    premium: { annual: premium },
    excess: 0,
    inclusions: [],
    exclusions: [],
    retrievedAt: new Date().toISOString(),
    sourceUrl: window.location.href,
    raw: {},
  };
}

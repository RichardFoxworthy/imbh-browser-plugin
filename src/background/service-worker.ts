/**
 * Background service worker (Manifest V3).
 *
 * Orchestrates quote runs, manages tabs, and bridges communication
 * between the popup/sidepanel and content scripts.
 *
 * MV3 service workers can be terminated after 5 minutes of inactivity.
 * State is persisted to IndexedDB to survive restarts.
 */

import { adapterRegistry } from '../adapters/adapter-registry';
import { runQuotes } from '../quoting/quote-runner';
import { saveQuoteResult } from '../quoting/quote-store';
import type { UserProfile } from '../profile/types';
import type { QuoteRunItem, QuoteRun } from '../quoting/types';

// Current run state — persisted on each update
let currentRun: QuoteRun | null = null;

// Listen for messages from popup, sidepanel, and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_ADAPTERS':
      handleGetAdapters(message).then(sendResponse);
      return true;

    case 'START_QUOTE_RUN':
      handleStartQuoteRun(message).then(sendResponse);
      return true;

    case 'GET_QUOTE_RUN_STATUS':
      sendResponse({ run: currentRun });
      return false;

    case 'AUTOMATION_PROGRESS':
      handleAutomationProgress(message);
      return false;

    case 'RUN_HEALTH_CHECKS':
      handleHealthChecks().then(sendResponse);
      return true;

    default:
      return false;
  }
});

// Open side panel when extension icon is clicked (if supported)
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });

async function handleGetAdapters(message: { productType?: string }) {
  const adapters = message.productType
    ? adapterRegistry.getByProductType(message.productType as any)
    : adapterRegistry.getAll();

  return {
    adapters: adapters.map((a) => ({
      id: a.id,
      name: a.name,
      provider: a.provider,
      productType: a.productType,
      logoUrl: a.logoUrl,
      enabled: a.enabled,
      startUrl: a.startUrl,
    })),
  };
}

async function handleStartQuoteRun(message: {
  adapterIds: string[];
  profile: UserProfile;
  productType: 'home' | 'motor';
}) {
  const { adapterIds, profile, productType } = message;

  const adapters = adapterIds
    .map((id) => adapterRegistry.get(id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  if (adapters.length === 0) {
    return { success: false, error: 'No valid adapters selected' };
  }

  // Start the quote run
  currentRun = await runQuotes(adapters, profile, productType, {
    onItemUpdate(item: QuoteRunItem) {
      // Broadcast progress to popup and sidepanel
      broadcastMessage({
        type: 'QUOTE_ITEM_UPDATE',
        item,
      });

      // Save completed quotes
      if (item.status === 'completed' && item.result) {
        saveQuoteResult(item.result);
      }
    },
    onRunComplete(run: QuoteRun) {
      currentRun = run;
      broadcastMessage({
        type: 'QUOTE_RUN_COMPLETE',
        run,
      });
    },
  });

  return { success: true, runId: currentRun.id };
}

function handleAutomationProgress(progress: any) {
  // Forward to popup/sidepanel
  broadcastMessage({
    type: 'AUTOMATION_PROGRESS',
    ...progress,
  });
}

async function handleHealthChecks() {
  const adapters = adapterRegistry.getAll();
  const results: Record<string, any> = {};

  for (const adapter of adapters) {
    results[adapter.id] = await adapter.healthCheck();
  }

  return { results };
}

/** Broadcast a message to all extension views (popup, sidepanel). */
function broadcastMessage(message: any) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No listeners — popup or sidepanel not open
  });
}

// Periodic health checks using alarms
chrome.alarms?.create('health-check', { periodInMinutes: 60 });

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === 'health-check') {
    handleHealthChecks();
  }
});

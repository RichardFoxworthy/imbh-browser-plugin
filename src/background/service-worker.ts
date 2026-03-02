/**
 * Background service worker (Manifest V3).
 *
 * Orchestrates quote runs, manages tabs, and bridges communication
 * between the popup/sidepanel and content scripts.
 *
 * Uses the crowdsourced adaptor system as the primary source for adaptor
 * definitions. Falls back to the legacy static adapter registry for any
 * provider not yet in the JSON system.
 *
 * MV3 service workers can be terminated after 5 minutes of inactivity.
 * State is persisted to IndexedDB to survive restarts.
 */

import { adapterRegistry } from '../adapters/adapter-registry';
import { runQuotes } from '../quoting/quote-runner';
import { saveQuoteResult } from '../quoting/quote-store';
import { initSync, syncAdaptors, flushContributions } from '../adaptors/adaptor-sync';
import { getAllAdaptorDefinitions, getAdaptorsByProduct, checkAdaptorHealth, getAdaptorConfidence } from '../adaptors/adaptor-runtime';
import { queueContribution } from '../adaptors/adaptor-cache';
import { getDb } from '../storage/db';
import type { UserProfile } from '../profile/types';
import type { QuoteRunItem, QuoteRun } from '../quoting/types';
import type { StepContribution } from '../adaptors/types';
import type { ProductType } from '../adapters/types';

// Current run state — persisted on each update
let currentRun: QuoteRun | null = null;

// Maps adapter IDs to their open tab IDs during a run
const adapterTabMap = new Map<string, number>();

// ---------------------------------------------------------------------------
// Initialise adaptor sync on startup
// ---------------------------------------------------------------------------
initSync().catch((err) => {
  console.warn('[service-worker] Adaptor sync init failed, using cached/seed data:', err);
});

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------
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

    case 'SUBMIT_CONTRIBUTIONS':
      handleSubmitContributions(message).then(sendResponse);
      return true;

    case 'SELECTOR_HEALTH':
      handleSelectorHealth(message);
      return false;

    case 'RUN_HEALTH_CHECKS':
      handleHealthChecks().then(sendResponse);
      return true;

    case 'SYNC_ADAPTORS':
      syncAdaptors().then(sendResponse);
      return true;

    case 'FOCUS_ADAPTER_TAB':
      handleFocusAdapterTab(message);
      return false;

    default:
      return false;
  }
});

// Open side panel when extension icon is clicked (if supported)
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * List available adaptors. Merges JSON adaptor definitions with
 * legacy TypeScript adapters for any provider not yet migrated.
 */
async function handleGetAdapters(message: { productType?: string }) {
  const productType = message.productType as ProductType | undefined;

  // Get adaptors from the new JSON system
  const jsonAdaptors = productType
    ? await getAdaptorsByProduct(productType)
    : await getAllAdaptorDefinitions();

  const jsonIds = new Set(jsonAdaptors.map((a) => a.id));

  // Get legacy adapters not yet in the JSON system
  const legacyAdapters = productType
    ? adapterRegistry.getByProductType(productType)
    : adapterRegistry.getAll();

  const legacyOnly = legacyAdapters.filter((a) => !jsonIds.has(a.id));

  // Merge into a unified list
  const adapters = [
    ...jsonAdaptors.map((a) => ({
      id: a.id,
      name: `${a.provider} ${a.productType}`,
      provider: a.provider,
      productType: a.productType,
      logoUrl: a.logoUrl,
      enabled: a.enabled,
      startUrl: a.startUrl,
      confidence: getAdaptorConfidence(a),
      source: 'crowdsourced' as const,
    })),
    ...legacyOnly.map((a) => ({
      id: a.id,
      name: a.name,
      provider: a.provider,
      productType: a.productType,
      logoUrl: a.logoUrl,
      enabled: a.enabled,
      startUrl: a.startUrl,
      confidence: 1,
      source: 'legacy' as const,
    })),
  ];

  return { adapters };
}

/**
 * Start a quote run. Uses JSON adaptors where available,
 * falls back to legacy adapters.
 */
async function handleStartQuoteRun(message: {
  adapterIds: string[];
  profile: UserProfile;
  productType: 'home' | 'motor';
}) {
  const { adapterIds, profile, productType } = message;

  // Resolve each requested adapter — try JSON first, then legacy
  const allJsonAdaptors = await getAllAdaptorDefinitions();
  const jsonMap = new Map(allJsonAdaptors.map((a) => [a.id, a]));

  // Build unified adapter list for the quote runner
  const adaptersForRunner: any[] = [];

  for (const id of adapterIds) {
    const jsonDef = jsonMap.get(id);
    if (jsonDef) {
      // Wrap JSON definition to match the InsuranceAdapter interface
      adaptersForRunner.push({
        id: jsonDef.id,
        name: `${jsonDef.provider} ${jsonDef.productType}`,
        provider: jsonDef.provider,
        productType: jsonDef.productType,
        logoUrl: jsonDef.logoUrl,
        startUrl: jsonDef.startUrl,
        enabled: jsonDef.enabled,
        getSteps: () => jsonDef.steps,
        extractQuote: () => null,
        healthCheck: () => checkAdaptorHealth(jsonDef),
        // Extra metadata for the content script to use hybrid engine
        _isJsonAdaptor: true,
        _extractionRules: jsonDef.extractionRules,
        _adaptorName: jsonDef.provider,
      });
    } else {
      const legacy = adapterRegistry.get(id);
      if (legacy) {
        adaptersForRunner.push(legacy);
      }
    }
  }

  if (adaptersForRunner.length === 0) {
    return { success: false, error: 'No valid adapters selected' };
  }

  // Initialise the run state immediately so the UI can transition
  const runId = `run-${Date.now()}`;
  currentRun = {
    id: runId,
    items: adaptersForRunner.map((a: any) => ({
      adapterId: a.id,
      adapterName: a.name,
      provider: a.provider,
      status: 'pending' as const,
      progress: 0,
      message: 'Waiting...',
      result: null,
    })),
    startedAt: new Date().toISOString(),
    productType,
  };

  // Auto-open the side panel so progress is visible even if the popup closes
  try {
    await (chrome.sidePanel as any)?.open?.({});
  } catch {
    // Side panel API may not be available or may require user gesture
  }

  // Start the quote run in the background — don't await so sendResponse
  // returns immediately and the popup can transition to the progress view
  adapterTabMap.clear();
  runQuotes(adaptersForRunner, profile, productType, {
    onTabCreated(adapterId: string, tabId: number) {
      adapterTabMap.set(adapterId, tabId);
    },
    onItemUpdate(item: QuoteRunItem) {
      const tabId = adapterTabMap.get(item.adapterId);
      broadcastMessage({
        type: 'QUOTE_ITEM_UPDATE',
        item,
        tabId,
      });

      if (item.status === 'completed' && item.result) {
        saveQuoteResult(item.result);
      }
    },
    onRunComplete(run: QuoteRun) {
      currentRun = run;
      adapterTabMap.clear();
      broadcastMessage({
        type: 'QUOTE_RUN_COMPLETE',
        run,
      });
    },
  }).catch((err) => {
    console.error('[service-worker] Quote run failed:', err);
  });

  return { success: true, runId };
}

function handleAutomationProgress(progress: any) {
  broadcastMessage({
    type: 'AUTOMATION_PROGRESS',
    ...progress,
  });
}

/**
 * Queue contributions from the content script for later submission.
 */
async function handleSubmitContributions(message: {
  contributions: StepContribution[];
}) {
  const { contributions } = message;
  let queued = 0;

  for (const contribution of contributions) {
    try {
      await queueContribution(contribution);
      queued++;
    } catch (err) {
      console.error('[service-worker] Failed to queue contribution:', err);
    }
  }

  // Trigger an immediate flush attempt
  flushContributions().catch(() => {});

  return { queued };
}

/**
 * Store selector health telemetry from the content script.
 */
async function handleSelectorHealth(message: any) {
  try {
    const db = await getDb();
    await db.put('selectorHealth', {
      id: `${message.adaptorId}-${message.stepId}-${message.fieldPath}-${Date.now()}`,
      adaptorId: message.adaptorId,
      stepId: message.stepId,
      fieldPath: message.fieldPath,
      primarySelector: message.primarySelector,
      primaryWorked: message.primaryWorked,
      fallbackUsed: message.fallbackUsed ?? null,
      labelMatchUsed: message.labelMatchUsed,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical — don't block the automation
  }
}

async function handleHealthChecks() {
  const results: Record<string, any> = {};

  // Check JSON adaptors
  const jsonAdaptors = await getAllAdaptorDefinitions();
  for (const adaptor of jsonAdaptors) {
    results[adaptor.id] = await checkAdaptorHealth(adaptor);
  }

  // Check legacy adapters not covered by JSON
  const jsonIds = new Set(jsonAdaptors.map((a) => a.id));
  const legacyAdapters = adapterRegistry.getAll().filter((a) => !jsonIds.has(a.id));
  for (const adapter of legacyAdapters) {
    results[adapter.id] = await adapter.healthCheck();
  }

  return { results };
}

function handleFocusAdapterTab(message: { adapterId: string }) {
  const tabId = adapterTabMap.get(message.adapterId);
  if (tabId != null) {
    chrome.tabs.update(tabId, { active: true }).catch(() => {});
    // Also focus the window containing the tab
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true });
    }).catch(() => {});
  }
}

/** Broadcast a message to all extension views (popup, sidepanel). */
function broadcastMessage(message: any) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No listeners — popup or sidepanel not open
  });
}

// ---------------------------------------------------------------------------
// Periodic tasks
// ---------------------------------------------------------------------------

chrome.alarms?.create('health-check', { periodInMinutes: 60 });
chrome.alarms?.create('adaptor-sync', { periodInMinutes: 15 });
chrome.alarms?.create('contribution-flush', { periodInMinutes: 5 });

chrome.alarms?.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case 'health-check':
      handleHealthChecks();
      break;
    case 'adaptor-sync':
      syncAdaptors().catch(() => {});
      break;
    case 'contribution-flush':
      flushContributions().catch(() => {});
      break;
  }
});

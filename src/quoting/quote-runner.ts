/**
 * Orchestrates running quotes across multiple insurance providers.
 * Manages tab creation, sequencing, and progress tracking.
 *
 * Supports both legacy InsuranceAdapter objects and JSON AdaptorDefinitions.
 * JSON adaptors are identified by the _isJsonAdaptor flag and routed
 * through the hybrid automation engine (START_HYBRID_AUTOMATION message).
 */

import type { UserProfile } from '../profile/types';
import type { QuoteRun, QuoteRunItem } from './types';
import { uid } from '../shared/utils';

export interface QuoteRunnerCallbacks {
  onItemUpdate: (item: QuoteRunItem) => void;
  onRunComplete: (run: QuoteRun) => void;
}

/**
 * An adapter passed to runQuotes may be a legacy InsuranceAdapter
 * or a JSON adaptor wrapper with extra metadata set by the service worker.
 */
interface AdapterLike {
  id: string;
  name: string;
  provider: string;
  productType: string;
  startUrl: string;
  getSteps: (profile: UserProfile) => any[];
  _isJsonAdaptor?: boolean;
  _extractionRules?: any;
  _adaptorName?: string;
}

/**
 * Run quotes for a set of adapters sequentially.
 * Opens each insurer's quote page in a new tab, runs the automation,
 * and collects results.
 */
export async function runQuotes(
  adapters: AdapterLike[],
  profile: UserProfile,
  productType: 'home' | 'motor',
  callbacks: QuoteRunnerCallbacks
): Promise<QuoteRun> {
  const run: QuoteRun = {
    id: uid(),
    items: adapters.map((a) => ({
      adapterId: a.id,
      adapterName: a.name,
      provider: a.provider,
      status: 'pending',
      progress: 0,
      message: 'Waiting...',
      result: null,
    })),
    startedAt: new Date().toISOString(),
    productType,
  };

  // Process adapters sequentially — one tab at a time to be respectful
  for (let i = 0; i < adapters.length; i++) {
    const adapter = adapters[i];
    const item = run.items[i];

    item.status = 'running';
    item.startedAt = new Date().toISOString();
    item.message = `Opening ${adapter.provider}...`;
    callbacks.onItemUpdate(item);

    try {
      // Open a new tab with the insurer's quote start page
      const tab = await chrome.tabs.create({
        url: adapter.startUrl,
        active: false, // Background tab
      });

      if (!tab.id) throw new Error('Failed to create tab');

      // Wait for page to load
      await waitForTabLoad(tab.id);

      // Get the adapter's steps
      const steps = adapter.getSteps(profile);

      // Route to the appropriate automation engine
      let result: any;

      if (adapter._isJsonAdaptor) {
        // JSON adaptor → hybrid engine (auto/assist mode)
        result = await chrome.tabs.sendMessage(tab.id, {
          type: 'START_HYBRID_AUTOMATION',
          adaptorId: adapter.id,
          adaptorName: adapter._adaptorName || adapter.provider,
          steps,
          extractionRules: adapter._extractionRules,
          profile,
        });
      } else {
        // Legacy adapter → original engine
        result = await chrome.tabs.sendMessage(tab.id, {
          type: 'START_AUTOMATION',
          adapterId: adapter.id,
          steps: serializeSteps(steps),
          profile,
        });
      }

      if (result.success && result.quote) {
        item.status = 'completed';
        item.result = result.quote;
        item.message = `$${result.quote.premium.annual}/year`;
        item.progress = 100;
      } else {
        item.status = 'error';
        item.error = result.error || 'Quote extraction failed';
        item.message = item.error!;
      }

      item.completedAt = new Date().toISOString();

      // Close the tab
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Tab may already be closed
      }
    } catch (err) {
      item.status = 'error';
      item.error = err instanceof Error ? err.message : 'Unknown error';
      item.message = item.error!;
      item.completedAt = new Date().toISOString();
    }

    callbacks.onItemUpdate(item);

    // Polite delay between providers (5-15 seconds)
    if (i < adapters.length - 1) {
      await new Promise((r) =>
        setTimeout(r, 5000 + Math.random() * 10000)
      );
    }
  }

  run.completedAt = new Date().toISOString();
  callbacks.onRunComplete(run);
  return run;
}

/** Wait for a tab to finish loading. */
function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, 30000);

    function listener(
      updatedTabId: number,
      changeInfo: { status?: string }
    ) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra delay for JS frameworks to hydrate
        setTimeout(resolve, 2000);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Serialize legacy adapter steps for messaging (functions become strings). */
function serializeSteps(steps: any[]): any[] {
  return steps.map((step) => ({
    ...step,
    fields: step.fields.map((f: any) => ({
      ...f,
      transform: f.transform ? f.transform.toString() : undefined,
    })),
  }));
}

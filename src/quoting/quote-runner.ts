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
  onTabCreated?: (adapterId: string, tabId: number) => void;
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

      callbacks.onTabCreated?.(adapter.id, tab.id);

      // Wait for page to load
      await waitForTabLoad(tab.id);

      // Get the adapter's steps
      const steps = adapter.getSteps(profile);

      // Build the automation message
      const automationMessage = adapter._isJsonAdaptor
        ? {
            type: 'START_HYBRID_AUTOMATION' as const,
            adaptorId: adapter.id,
            adaptorName: adapter._adaptorName || adapter.provider,
            steps,
            extractionRules: adapter._extractionRules,
            profile,
          }
        : {
            type: 'START_AUTOMATION' as const,
            adapterId: adapter.id,
            steps: serializeSteps(steps),
            profile,
          };

      // Send automation message with Cloudflare challenge recovery.
      // If the content script context is destroyed by a full-page navigation
      // (e.g. Cloudflare challenge → actual site), we detect the navigation
      // and re-send the message to the new page.
      const result = await sendWithChallengeRecovery(tab.id, automationMessage);

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

/** Wait for a tab to finish loading. Rejects immediately if the tab is removed. */
function waitForTabLoad(tabId: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Tab load timeout'));
    }, timeoutMs);

    function onUpdated(
      updatedTabId: number,
      changeInfo: { status?: string }
    ) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        // Extra delay for JS frameworks to hydrate
        setTimeout(resolve, 2000);
      }
    }

    function onRemoved(removedTabId: number) {
      if (removedTabId === tabId) {
        cleanup();
        reject(new Error('Tab was closed or crashed'));
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

/**
 * Send the automation message to a tab's content script, recovering from
 * Cloudflare challenge navigations.
 *
 * Cloudflare managed challenges display a full-page interstitial. When the
 * user solves it, the browser navigates to a new URL which destroys the
 * content script context. The original sendMessage promise rejects (or the
 * content script's response is lost). We detect this by racing the
 * sendMessage against a tab navigation listener. On navigation, we wait
 * for the new page to load and re-send the automation message.
 */
async function sendWithChallengeRecovery(
  tabId: number,
  message: any,
  maxRetries = 3
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await raceMessageWithNavigation(tabId, message);
      if (result.navigated) {
        // Content script context was destroyed by navigation (likely
        // Cloudflare challenge resolved). Wait for the new page, then retry.
        await waitForTabLoad(tabId, 60000);
        continue;
      }
      return result.response;
    } catch (err) {
      // sendMessage can fail if the content script context was destroyed
      // mid-flight (e.g. Cloudflare navigation). Wait for the tab to
      // settle and retry.
      const isContextDestroyed =
        err instanceof Error &&
        (err.message.includes('Receiving end does not exist') ||
          err.message.includes('message port closed') ||
          err.message.includes('Could not establish connection'));

      if (isContextDestroyed && attempt < maxRetries) {
        await waitForTabLoad(tabId, 60000).catch(() => {});
        // Extra wait for content script to initialise
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Automation message failed after challenge recovery retries');
}

/**
 * Race sendMessage against a tab navigation event.
 * Returns { navigated: true } if the tab navigated before the message
 * got a response, or { navigated: false, response } if it succeeded.
 */
function raceMessageWithNavigation(
  tabId: number,
  message: any
): Promise<{ navigated: true } | { navigated: false; response: any }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    // Capture the initial URL origin+pathname so we can distinguish
    // SPA hash changes from real full-page navigations
    let initialOriginPath: string | null = null;
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.url) {
        try {
          const u = new URL(tab.url);
          initialOriginPath = u.origin + u.pathname;
        } catch {}
      }
    }).catch(() => {});

    function cleanup() {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    // Listen for full-page navigation (Cloudflare challenge resolution).
    // Ignore SPA hash changes — the content script context survives those
    // and the automation is still running.
    function onUpdated(
      updatedTabId: number,
      changeInfo: { status?: string; url?: string }
    ) {
      if (updatedTabId !== tabId || settled) return;

      if (changeInfo.url) {
        // Check if this is a real navigation (origin+pathname changed)
        // vs a SPA hash change (only fragment changed)
        try {
          const newUrl = new URL(changeInfo.url);
          const newOriginPath = newUrl.origin + newUrl.pathname;
          if (initialOriginPath && newOriginPath === initialOriginPath) {
            // Same origin+pathname — just a hash change, ignore
            return;
          }
        } catch {}

        settled = true;
        cleanup();
        resolve({ navigated: true });
      }
    }

    function onRemoved(removedTabId: number) {
      if (removedTabId !== tabId || settled) return;
      settled = true;
      cleanup();
      reject(new Error('Tab was closed or crashed'));
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    chrome.tabs.sendMessage(tabId, message).then(
      (response) => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ navigated: false, response });
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      }
    );
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

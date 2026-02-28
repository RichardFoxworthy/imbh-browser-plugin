/**
 * Adaptor Sync Client
 *
 * Handles communication with the central adaptor service:
 * - Fetches latest adaptor definitions on startup
 * - Submits queued user contributions in batches
 * - Falls back to locally cached adaptors when offline
 */

import {
  getCachedVersions,
  cacheAdaptor,
  cacheAdaptors,
  getAllCachedAdaptors,
  getPendingContributions,
  removeContribution,
  incrementRetry,
  pruneStaleContributions,
} from './adaptor-cache';
import type {
  AdaptorDefinition,
  AdaptorVersionMap,
  StepContribution,
} from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL = 'https://api.imbh.com.au'; // TODO: make configurable

const SYNC_INTERVAL_MS = 15 * 60 * 1000;   // 15 minutes
const CONTRIBUTION_BATCH_INTERVAL_MS = 30_000; // 30 seconds
const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 2000;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let contributionTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the sync system. Call once on extension startup.
 *
 * 1. Syncs adaptor definitions from the central service
 * 2. Starts periodic sync timer
 * 3. Starts periodic contribution submission
 */
export async function initSync(): Promise<void> {
  // Initial sync
  await syncAdaptors();

  // Periodic sync
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(syncAdaptors, SYNC_INTERVAL_MS);

  // Periodic contribution flush
  if (contributionTimer) clearInterval(contributionTimer);
  contributionTimer = setInterval(flushContributions, CONTRIBUTION_BATCH_INTERVAL_MS);

  // Clean up stale contributions
  await pruneStaleContributions();
}

/**
 * Stop all sync timers. Call on extension shutdown.
 */
export function stopSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (contributionTimer) {
    clearInterval(contributionTimer);
    contributionTimer = null;
  }
}

/**
 * Sync adaptor definitions from the central service.
 * Only fetches adaptors whose version has changed.
 */
export async function syncAdaptors(): Promise<{
  updated: string[];
  errors: string[];
}> {
  const updated: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Get remote version map
    const remoteVersions = await fetchWithRetry<AdaptorVersionMap>(
      `${API_BASE_URL}/api/adaptors/versions`
    );

    // 2. Compare with local cache
    const localVersions = await getCachedVersions();
    const staleIds: string[] = [];

    for (const [id, remoteVersion] of Object.entries(remoteVersions)) {
      const localVersion = localVersions[id] ?? 0;
      if (remoteVersion > localVersion) {
        staleIds.push(id);
      }
    }

    if (staleIds.length === 0) return { updated, errors };

    // 3. Fetch stale adaptors (in parallel, capped at 5 concurrent)
    const chunks = chunkArray(staleIds, 5);
    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map((id) =>
          fetchWithRetry<AdaptorDefinition>(`${API_BASE_URL}/api/adaptors/${id}`)
        )
      );

      const toCache: AdaptorDefinition[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          toCache.push(result.value);
          updated.push(chunk[i]);
        } else {
          errors.push(chunk[i]);
        }
      }

      if (toCache.length > 0) {
        await cacheAdaptors(toCache);
      }
    }
  } catch {
    // Offline or API down — continue with cached adaptors
    console.warn('[adaptor-sync] Sync failed, using cached adaptors');
  }

  return { updated, errors };
}

/**
 * Submit all queued contributions to the central service.
 */
export async function flushContributions(): Promise<{
  submitted: number;
  failed: number;
}> {
  let submitted = 0;
  let failed = 0;

  const pending = await getPendingContributions();
  if (pending.length === 0) return { submitted, failed };

  // Group by adaptor for batch submission
  const byAdaptor = new Map<string, typeof pending>();
  for (const item of pending) {
    const key = item.contribution.adaptorId;
    const list = byAdaptor.get(key) ?? [];
    list.push(item);
    byAdaptor.set(key, list);
  }

  for (const [adaptorId, items] of byAdaptor) {
    try {
      const contributions = items.map((i) => i.contribution);
      await fetchWithRetry(
        `${API_BASE_URL}/api/adaptors/${adaptorId}/contributions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contributions }),
        }
      );

      // Remove successfully submitted contributions
      for (const item of items) {
        await removeContribution(item.id);
        submitted++;
      }
    } catch {
      // Increment retry count for failed submissions
      for (const item of items) {
        await incrementRetry(item.id);
        failed++;
      }
    }
  }

  return { submitted, failed };
}

/**
 * Get an adaptor definition, preferring cache, falling back to fetch.
 */
export async function getAdaptor(
  adaptorId: string
): Promise<AdaptorDefinition | null> {
  const all = await getAllCachedAdaptors();
  const cached = all.find((a) => a.id === adaptorId);
  if (cached) return cached;

  // Try fetching directly
  try {
    const definition = await fetchWithRetry<AdaptorDefinition>(
      `${API_BASE_URL}/api/adaptors/${adaptorId}`
    );
    await cacheAdaptor(definition);
    return definition;
  } catch {
    return null;
  }
}

/**
 * Get all available adaptors.
 */
export async function getAllAdaptors(): Promise<AdaptorDefinition[]> {
  return getAllCachedAdaptors();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchWithRetry<T>(
  url: string,
  init?: RequestInit,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw lastError!;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

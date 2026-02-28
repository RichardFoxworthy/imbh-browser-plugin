/**
 * Local adaptor cache backed by IndexedDB.
 *
 * Stores adaptor definitions locally so the plugin works offline.
 * Syncs with the central service on startup and periodically.
 * Queues contributions for batch submission.
 */

import { getDb } from '../storage/db';
import { uid } from '../shared/utils';
import type {
  AdaptorDefinition,
  CachedAdaptor,
  PendingContribution,
  StepContribution,
  AdaptorVersionMap,
} from './types';

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Get a cached adaptor definition by ID.
 */
export async function getCachedAdaptor(
  adaptorId: string
): Promise<AdaptorDefinition | null> {
  const db = await getDb();
  const cached = await db.get('adaptorCache', adaptorId) as CachedAdaptor | undefined;
  return cached?.definition ?? null;
}

/**
 * Get all cached adaptor definitions.
 */
export async function getAllCachedAdaptors(): Promise<AdaptorDefinition[]> {
  const db = await getDb();
  const all = (await db.getAll('adaptorCache')) as CachedAdaptor[];
  return all.map((c) => c.definition);
}

/**
 * Get version map of all cached adaptors.
 */
export async function getCachedVersions(): Promise<AdaptorVersionMap> {
  const adaptors = await getAllCachedAdaptors();
  const versions: AdaptorVersionMap = {};
  for (const a of adaptors) {
    versions[a.id] = a.version;
  }
  return versions;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Cache an adaptor definition (upsert).
 */
export async function cacheAdaptor(definition: AdaptorDefinition): Promise<void> {
  const db = await getDb();
  const cached: CachedAdaptor = {
    adaptorId: definition.id,
    definition,
    cachedAt: new Date().toISOString(),
  };
  await db.put('adaptorCache', cached);
}

/**
 * Cache multiple adaptor definitions.
 */
export async function cacheAdaptors(definitions: AdaptorDefinition[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('adaptorCache', 'readwrite');
  for (const def of definitions) {
    const cached: CachedAdaptor = {
      adaptorId: def.id,
      definition: def,
      cachedAt: new Date().toISOString(),
    };
    tx.store.put(cached);
  }
  await tx.done;
}

/**
 * Delete a cached adaptor.
 */
export async function deleteCachedAdaptor(adaptorId: string): Promise<void> {
  const db = await getDb();
  await db.delete('adaptorCache', adaptorId);
}

// ---------------------------------------------------------------------------
// Contribution queue
// ---------------------------------------------------------------------------

/**
 * Queue a contribution for later submission to the central service.
 */
export async function queueContribution(
  contribution: StepContribution
): Promise<void> {
  const db = await getDb();
  const pending: PendingContribution = {
    id: uid(),
    contribution,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  await db.put('pendingContributions', pending);
}

/**
 * Get all pending contributions.
 */
export async function getPendingContributions(): Promise<PendingContribution[]> {
  const db = await getDb();
  return (await db.getAll('pendingContributions')) as PendingContribution[];
}

/**
 * Remove a contribution from the queue (after successful submission).
 */
export async function removeContribution(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('pendingContributions', id);
}

/**
 * Increment retry count for a failed contribution.
 */
export async function incrementRetry(id: string): Promise<void> {
  const db = await getDb();
  const pending = (await db.get('pendingContributions', id)) as
    | PendingContribution
    | undefined;
  if (pending) {
    pending.retryCount++;
    await db.put('pendingContributions', pending);
  }
}

/**
 * Discard contributions that have exceeded max retries.
 */
export async function pruneStaleContributions(maxRetries = 10): Promise<number> {
  const db = await getDb();
  const all = (await db.getAll('pendingContributions')) as PendingContribution[];
  let pruned = 0;
  const tx = db.transaction('pendingContributions', 'readwrite');
  for (const item of all) {
    if (item.retryCount >= maxRetries) {
      tx.store.delete(item.id);
      pruned++;
    }
  }
  await tx.done;
  return pruned;
}

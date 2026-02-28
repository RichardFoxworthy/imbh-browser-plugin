import { getDb } from '../storage/db';
import { adapterRegistry } from './adapter-registry';
import type { AdapterHealth } from './types';

export interface HealthReport {
  adapterId: string;
  adapterName: string;
  health: AdapterHealth;
}

/**
 * Run health checks against all registered adapters.
 * Stores results in IndexedDB for the UI to display.
 */
export async function runAllHealthChecks(): Promise<HealthReport[]> {
  const adapters = adapterRegistry.getAll();
  const reports: HealthReport[] = [];

  for (const adapter of adapters) {
    const health = await adapter.healthCheck();
    reports.push({
      adapterId: adapter.id,
      adapterName: adapter.name,
      health,
    });

    // Persist to IndexedDB
    const db = await getDb();
    await db.put('adapterHealth', {
      adapterId: adapter.id,
      status: health.status,
      lastChecked: health.lastChecked,
      error: health.error,
    });
  }

  return reports;
}

/**
 * Get the most recent health status for a single adapter.
 */
export async function getAdapterHealth(adapterId: string): Promise<AdapterHealth | null> {
  const db = await getDb();
  const record = await db.get('adapterHealth', adapterId);
  if (!record) return null;

  return {
    status: record.status,
    lastChecked: record.lastChecked,
    message: '',
    error: record.error,
  };
}

/**
 * Get health status for all adapters.
 */
export async function getAllAdapterHealth(): Promise<Map<string, AdapterHealth>> {
  const db = await getDb();
  const records = await db.getAll('adapterHealth');
  const map = new Map<string, AdapterHealth>();

  for (const record of records) {
    map.set(record.adapterId, {
      status: record.status,
      lastChecked: record.lastChecked,
      message: '',
      error: record.error,
    });
  }

  return map;
}

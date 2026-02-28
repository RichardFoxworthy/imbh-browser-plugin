/**
 * Adaptor API Routes
 *
 * GET  /api/adaptors              → list all adaptors (metadata only)
 * GET  /api/adaptors/versions     → {id: version} map for sync
 * GET  /api/adaptors/:id          → full adaptor definition
 * GET  /api/adaptors/:id/health   → aggregated health for an adaptor
 */

import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/client';

export const adaptorRoutes = Router();

/**
 * List all adaptors (metadata only, no full definitions).
 */
adaptorRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const adaptors = await db.query(`
      SELECT id, version, provider, product_type, logo_url, start_url, enabled, updated_at
      FROM adaptors
      WHERE enabled = true
      ORDER BY provider
    `);

    res.json(adaptors.rows.map(row => ({
      id: row.id,
      version: row.version,
      provider: row.provider,
      productType: row.product_type,
      logoUrl: row.logo_url,
      startUrl: row.start_url,
      enabled: row.enabled,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    console.error('Error listing adaptors:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Version map for efficient sync.
 * Extension compares this against local cache and only fetches stale adaptors.
 */
adaptorRoutes.get('/versions', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT id, version FROM adaptors WHERE enabled = true'
    );

    const versions: Record<string, number> = {};
    for (const row of result.rows) {
      versions[row.id] = row.version;
    }

    res.json(versions);
  } catch (err) {
    console.error('Error fetching versions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get full adaptor definition by ID.
 */
adaptorRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT definition FROM adaptors WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Adaptor not found' });
      return;
    }

    res.json(result.rows[0].definition);
  } catch (err) {
    console.error('Error fetching adaptor:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get aggregated health summary for an adaptor.
 */
adaptorRoutes.get('/:id/health', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT * FROM adaptor_health_summary WHERE adaptor_id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Adaptor not found' });
      return;
    }

    const row = result.rows[0];
    res.json({
      adaptorId: row.adaptor_id,
      provider: row.provider,
      version: row.version,
      enabled: row.enabled,
      trackedSelectors: row.tracked_selectors,
      avgConfidence: row.avg_confidence,
      minConfidence: row.min_confidence,
      totalSuccesses: row.total_successes,
      totalFailures: row.total_failures,
      lastSuccess: row.last_success,
      lastFailure: row.last_failure,
    });
  } catch (err) {
    console.error('Error fetching health:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

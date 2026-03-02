/**
 * Discovery API Routes
 *
 * POST /api/adaptors/bootstrap          → create a skeleton adaptor from URL
 * POST /api/adaptors/:id/discovery      → submit a full discovery session
 * GET  /api/adaptors/:id/maturity       → get adaptor maturity status
 *
 * These endpoints enable the zero-knowledge bootstrap flow:
 * 1. A user provides just a URL, provider name, and product type
 * 2. A skeleton adaptor with zero steps is created
 * 3. The user navigates the form in discovery mode
 * 4. The full session is submitted and merged into the adaptor
 * 5. Subsequent users refine and verify the discovered steps
 */

import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/client';
import { processDiscoverySession } from '../services/discovery-processor';
import type { SkeletonAdaptorRequest, DiscoverySession } from '../../src/adaptors/types';

export const discoveryRoutes = Router();

/**
 * Create a skeleton adaptor from just a URL and provider name.
 * Returns the new adaptor ID if created, or the existing ID if
 * an adaptor already exists for this provider + product type.
 */
discoveryRoutes.post('/bootstrap', async (req: Request, res: Response) => {
  const body = req.body as SkeletonAdaptorRequest;

  if (!body.provider || !body.productType || !body.startUrl) {
    res.status(400).json({
      error: 'provider, productType, and startUrl are required',
    });
    return;
  }

  // Validate URL
  try {
    new URL(body.startUrl);
  } catch {
    res.status(400).json({ error: 'startUrl must be a valid URL' });
    return;
  }

  const id = deriveAdaptorId(body.provider, body.productType);

  const db = getDb();

  // Check if this adaptor already exists
  const existing = await db.query(
    'SELECT id, version FROM adaptors WHERE id = $1',
    [id]
  );

  if (existing.rows.length > 0) {
    res.json({
      adaptorId: id,
      created: false,
      message: 'Adaptor already exists',
      version: existing.rows[0].version,
    });
    return;
  }

  // Create skeleton definition
  const now = new Date().toISOString();
  const definition = {
    id,
    version: 1,
    provider: body.provider,
    productType: body.productType,
    logoUrl: body.logoUrl || '',
    startUrl: normaliseUrl(body.startUrl),
    enabled: true,
    updatedAt: now,
    steps: [],
    extractionRules: {
      premiumSelectors: [],
      excessSelectors: [],
      inclusionSelectors: [],
      exclusionSelectors: [],
      confidence: 0,
      lastVerified: now,
    },
  };

  try {
    await db.query(
      `INSERT INTO adaptors (id, version, provider, product_type, logo_url, start_url, enabled, definition)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        definition.id,
        definition.version,
        definition.provider,
        definition.productType,
        definition.logoUrl,
        definition.startUrl,
        definition.enabled,
        JSON.stringify(definition),
      ]
    );

    res.status(201).json({
      adaptorId: id,
      created: true,
      message: 'Skeleton adaptor created — ready for discovery',
      definition,
    });
  } catch (err) {
    console.error('Error creating skeleton adaptor:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Submit a full discovery session for an adaptor.
 * This is the main mechanism for building out an adaptor from scratch:
 * the user navigated the entire form and we recorded every step.
 */
discoveryRoutes.post('/:id/discovery', async (req: Request, res: Response) => {
  const adaptorId = req.params.id;
  const session = req.body as DiscoverySession;

  if (!session.sessionId || !session.steps || !Array.isArray(session.steps)) {
    res.status(400).json({ error: 'Valid discovery session is required' });
    return;
  }

  if (session.steps.length === 0) {
    res.status(400).json({ error: 'Discovery session must contain at least one step' });
    return;
  }

  if (session.steps.length > 30) {
    res.status(400).json({ error: 'Discovery session cannot exceed 30 steps' });
    return;
  }

  const db = getDb();

  // Verify adaptor exists
  const adaptor = await db.query(
    'SELECT id, definition FROM adaptors WHERE id = $1',
    [adaptorId]
  );
  if (adaptor.rows.length === 0) {
    res.status(404).json({ error: 'Adaptor not found' });
    return;
  }

  try {
    // Store the raw discovery session
    await db.query(
      `INSERT INTO discovery_sessions
       (adaptor_id, session_id, plugin_version, steps, extraction_hints, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adaptorId,
        session.sessionId,
        session.pluginVersion,
        JSON.stringify(session.steps),
        session.extractionHints ? JSON.stringify(session.extractionHints) : null,
        session.startedAt,
        session.completedAt,
      ]
    );

    // Process the session — merge discovered steps into the adaptor
    const result = await processDiscoverySession(adaptorId, session);

    res.json({
      processed: true,
      stepsDiscovered: session.steps.length,
      stepsPromoted: result.stepsPromoted,
      adaptorMaturity: result.maturity,
      message: result.message,
    });
  } catch (err) {
    console.error('Error processing discovery session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get the maturity status of an adaptor, including how many
 * discovery sessions have been submitted and what the current
 * step coverage looks like.
 */
discoveryRoutes.get('/:id/maturity', async (req: Request, res: Response) => {
  const adaptorId = req.params.id;
  const db = getDb();

  try {
    // Get adaptor definition
    const adaptor = await db.query(
      'SELECT definition FROM adaptors WHERE id = $1',
      [adaptorId]
    );
    if (adaptor.rows.length === 0) {
      res.status(404).json({ error: 'Adaptor not found' });
      return;
    }

    const definition = adaptor.rows[0].definition;

    // Count discovery sessions
    const sessionCount = await db.query(
      'SELECT COUNT(*)::int AS count FROM discovery_sessions WHERE adaptor_id = $1',
      [adaptorId]
    );

    // Determine maturity
    const stepCount = definition.steps?.length || 0;
    const avgConfidence = stepCount > 0
      ? definition.steps.reduce((s: number, step: any) => s + (step.confidence || 0), 0) / stepCount
      : 0;
    const maxContributors = stepCount > 0
      ? Math.max(...definition.steps.map((s: any) => s.contributorCount || 0))
      : 0;

    let maturity = 'skeleton';
    if (avgConfidence >= 0.7 && maxContributors >= 5) maturity = 'stable';
    else if (avgConfidence >= 0.3 && maxContributors >= 3) maturity = 'usable';
    else if (maxContributors >= 2) maturity = 'emerging';
    else if (stepCount > 0) maturity = 'discovered';

    res.json({
      adaptorId,
      maturity,
      stepCount,
      avgConfidence,
      discoverySessions: sessionCount.rows[0].count,
      maxContributors,
    });
  } catch (err) {
    console.error('Error fetching maturity:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveAdaptorId(provider: string, productType: string): string {
  return `${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}-${productType}`;
}

function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

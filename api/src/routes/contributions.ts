/**
 * Contribution API Routes
 *
 * POST /api/adaptors/:id/contributions → submit step contributions
 *
 * Contributions are processed asynchronously:
 * - verifications immediately update confidence scores
 * - failure_reports immediately reduce confidence scores
 * - new_step and update contributions are queued for processing
 */

import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/client';
import { processContribution } from '../services/contribution-processor';
import type { StepContribution } from '../../src/adaptors/types';

export const contributionRoutes = Router();

/**
 * Submit contributions for an adaptor.
 * Accepts a batch of contributions in a single request.
 */
contributionRoutes.post(
  '/:id/contributions',
  async (req: Request, res: Response) => {
    const adaptorId = req.params.id;
    const { contributions } = req.body as {
      contributions: StepContribution[];
    };

    if (!Array.isArray(contributions) || contributions.length === 0) {
      res.status(400).json({ error: 'contributions array is required' });
      return;
    }

    if (contributions.length > 50) {
      res.status(400).json({ error: 'Maximum 50 contributions per request' });
      return;
    }

    const db = getDb();

    // Verify adaptor exists
    const adaptorResult = await db.query(
      'SELECT id FROM adaptors WHERE id = $1',
      [adaptorId]
    );
    if (adaptorResult.rows.length === 0) {
      res.status(404).json({ error: 'Adaptor not found' });
      return;
    }

    const results = {
      processed: 0,
      queued: 0,
      errors: 0,
    };

    for (const contribution of contributions) {
      try {
        // Validate contribution
        if (contribution.adaptorId !== adaptorId) {
          results.errors++;
          continue;
        }

        // Process based on type
        if (
          contribution.type === 'verification' ||
          contribution.type === 'failure_report'
        ) {
          // These are processed immediately (confidence score updates)
          await processContribution(contribution);
          results.processed++;
        } else {
          // new_step and update are queued for review/auto-processing
          await db.query(
            `INSERT INTO contributions
             (adaptor_id, step_id, type, plugin_version, page_url, page_title, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              contribution.adaptorId,
              contribution.stepId,
              contribution.type,
              contribution.pluginVersion,
              contribution.pageUrl,
              contribution.pageTitle,
              JSON.stringify(contribution),
            ]
          );
          results.queued++;
        }
      } catch (err) {
        console.error('Error processing contribution:', err);
        results.errors++;
      }
    }

    res.json(results);
  }
);

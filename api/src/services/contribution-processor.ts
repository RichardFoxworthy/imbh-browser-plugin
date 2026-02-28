/**
 * Contribution Processor
 *
 * Processes user contributions to update adaptor confidence scores
 * and automatically promote selector updates when enough users confirm them.
 *
 * Confidence formula:
 *   confidence = success_count / (success_count + failure_count + age_decay)
 *
 * Where age_decay = days_since_last_verification * 0.01
 */

import { getDb } from '../db/client';
import type { StepContribution, DiscoveredField } from '../../src/adaptors/types';

// Minimum number of user verifications before a selector change is promoted
const QUORUM_THRESHOLD = 3;

// Confidence below which a step is flagged for assist mode
const LOW_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Process a single contribution.
 * Verifications and failures update confidence immediately.
 */
export async function processContribution(
  contribution: StepContribution
): Promise<void> {
  switch (contribution.type) {
    case 'verification':
      await handleVerification(contribution);
      break;
    case 'failure_report':
      await handleFailureReport(contribution);
      break;
    case 'update':
      await handleUpdate(contribution);
      break;
    case 'new_step':
      await handleNewStep(contribution);
      break;
  }
}

/**
 * A user's automation run successfully completed this step.
 * Increment success count and recalculate confidence.
 */
async function handleVerification(contribution: StepContribution): Promise<void> {
  if (!contribution.stepId) return;

  const db = getDb();

  // Upsert step health: increment success_count
  await db.query(
    `INSERT INTO step_health (adaptor_id, step_id, success_count, last_success, confidence)
     VALUES ($1, $2, 1, NOW(), 0.5)
     ON CONFLICT (adaptor_id, step_id, field_path)
     DO UPDATE SET
       success_count = step_health.success_count + 1,
       last_success = NOW(),
       confidence = (step_health.success_count + 1)::real /
         (step_health.success_count + 1 + step_health.failure_count +
          GREATEST(0, EXTRACT(EPOCH FROM NOW() - COALESCE(step_health.last_success, NOW())) / 86400 * 0.01))::real,
       updated_at = NOW()`,
    [contribution.adaptorId, contribution.stepId]
  );

  // Update the step's confidence in the adaptor definition
  await updateStepConfidence(contribution.adaptorId, contribution.stepId);
}

/**
 * A user's automation run failed on this step.
 * Increment failure count and reduce confidence.
 */
async function handleFailureReport(contribution: StepContribution): Promise<void> {
  if (!contribution.stepId) return;

  const db = getDb();

  // Upsert step health: increment failure_count
  await db.query(
    `INSERT INTO step_health (adaptor_id, step_id, failure_count, last_failure, confidence)
     VALUES ($1, $2, 1, NOW(), 0.5)
     ON CONFLICT (adaptor_id, step_id, field_path)
     DO UPDATE SET
       failure_count = step_health.failure_count + 1,
       last_failure = NOW(),
       confidence = step_health.success_count::real /
         (step_health.success_count + step_health.failure_count + 1 +
          GREATEST(0, EXTRACT(EPOCH FROM NOW() - COALESCE(step_health.last_success, NOW())) / 86400 * 0.01))::real,
       updated_at = NOW()`,
    [contribution.adaptorId, contribution.stepId]
  );

  // Also track per-field failures if we know which selectors failed
  if (contribution.failedSelectors) {
    for (const selector of contribution.failedSelectors) {
      await db.query(
        `UPDATE step_health
         SET failure_count = failure_count + 1,
             last_failure = NOW(),
             confidence = success_count::real / (success_count + failure_count + 1)::real,
             updated_at = NOW()
         WHERE adaptor_id = $1 AND step_id = $2 AND primary_selector = $3`,
        [contribution.adaptorId, contribution.stepId, selector]
      );
    }
  }

  await updateStepConfidence(contribution.adaptorId, contribution.stepId);
}

/**
 * A user has provided updated selector information for an existing step.
 * Check if we have quorum to auto-promote the update.
 */
async function handleUpdate(contribution: StepContribution): Promise<void> {
  if (!contribution.stepId || !contribution.fields?.length) return;

  const db = getDb();

  // Store the contribution for quorum checking
  await db.query(
    `INSERT INTO contributions
     (adaptor_id, step_id, type, plugin_version, page_url, page_title, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      contribution.adaptorId,
      contribution.stepId,
      'update',
      contribution.pluginVersion,
      contribution.pageUrl,
      contribution.pageTitle,
      JSON.stringify(contribution),
    ]
  );

  // Check quorum: do we have enough matching contributions?
  await checkAndPromoteUpdate(contribution.adaptorId, contribution.stepId);
}

/**
 * A user discovered a completely new step not in the current definition.
 * Queue it for admin review (auto-promotion requires higher quorum).
 */
async function handleNewStep(contribution: StepContribution): Promise<void> {
  const db = getDb();

  await db.query(
    `INSERT INTO contributions
     (adaptor_id, step_id, type, plugin_version, page_url, page_title, payload, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
    [
      contribution.adaptorId,
      contribution.stepId,
      'new_step',
      contribution.pluginVersion,
      contribution.pageUrl,
      contribution.pageTitle,
      JSON.stringify(contribution),
    ]
  );
}

// ---------------------------------------------------------------------------
// Confidence calculation and auto-promotion
// ---------------------------------------------------------------------------

/**
 * Recalculate and update a step's confidence in the adaptor definition.
 */
async function updateStepConfidence(
  adaptorId: string,
  stepId: string
): Promise<void> {
  const db = getDb();

  // Get aggregated confidence for this step
  const result = await db.query(
    `SELECT AVG(confidence) as avg_confidence
     FROM step_health
     WHERE adaptor_id = $1 AND step_id = $2`,
    [adaptorId, stepId]
  );

  if (result.rows.length === 0) return;

  const confidence = result.rows[0].avg_confidence ?? 0.5;

  // Update the step confidence in the adaptor definition JSONB
  await db.query(
    `UPDATE adaptors
     SET definition = jsonb_set(
       definition,
       (SELECT ('{steps,' || idx::text || ',confidence}')::text[]
        FROM jsonb_array_elements(definition->'steps') WITH ORDINALITY AS s(step, idx)
        WHERE step->>'id' = $2
        LIMIT 1),
       $3::jsonb
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [adaptorId, stepId, JSON.stringify(confidence)]
  );
}

/**
 * Check if enough users have submitted matching updates for a step,
 * and auto-promote the selector update if quorum is met.
 */
async function checkAndPromoteUpdate(
  adaptorId: string,
  stepId: string
): Promise<void> {
  const db = getDb();

  // Get recent pending update contributions for this step
  const result = await db.query(
    `SELECT payload
     FROM contributions
     WHERE adaptor_id = $1 AND step_id = $2
       AND type = 'update' AND status = 'pending'
       AND created_at > NOW() - INTERVAL '7 days'
     ORDER BY created_at DESC
     LIMIT 20`,
    [adaptorId, stepId]
  );

  if (result.rows.length < QUORUM_THRESHOLD) return;

  // Check if we have quorum on selector changes
  const contributions = result.rows.map(
    (r) => r.payload as StepContribution
  );

  // Group by discovered field selectors
  const selectorVotes = new Map<string, number>();

  for (const contrib of contributions) {
    if (!contrib.fields) continue;
    for (const field of contrib.fields) {
      const key = `${field.selector}::${field.label}`;
      selectorVotes.set(key, (selectorVotes.get(key) || 0) + 1);
    }
  }

  // Find selectors with quorum
  const promotable = Array.from(selectorVotes.entries())
    .filter(([_, count]) => count >= QUORUM_THRESHOLD);

  if (promotable.length === 0) return;

  // TODO: Auto-promote the selector updates into the adaptor definition.
  // For now, mark the contributions as processed.
  // In production, this would update the JSONB definition and bump the version.

  await db.query(
    `UPDATE contributions
     SET status = 'processed', processed_at = NOW()
     WHERE adaptor_id = $1 AND step_id = $2
       AND type = 'update' AND status = 'pending'`,
    [adaptorId, stepId]
  );

  // Bump adaptor version so clients sync the update
  await db.query(
    `UPDATE adaptors SET version = version + 1, updated_at = NOW()
     WHERE id = $1`,
    [adaptorId]
  );
}

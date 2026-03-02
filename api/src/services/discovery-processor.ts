/**
 * Discovery Session Processor
 *
 * Merges full discovery sessions into adaptor definitions.
 *
 * When multiple users discover the same insurer form, their sessions
 * are compared and merged:
 *
 * 1. Steps are aligned by URL pattern and field fingerprints
 * 2. Matching steps across sessions increase confidence
 * 3. Steps with enough confirmations are "promoted" into the definition
 * 4. Extraction hints from multiple users are merged for accuracy
 *
 * This is what enables the zero-knowledge → usable adaptor progression.
 */

import { getDb } from '../db/client';
import type {
  DiscoverySession,
  DiscoveredStep,
  AdaptorMaturity,
  ExtractionHints,
} from '../../src/adaptors/types';

// Minimum sessions before steps are promoted into the definition
const DISCOVERY_QUORUM = 2;

// Minimum confidence score for a step to be promoted
const PROMOTION_CONFIDENCE = 0.3;

export interface ProcessingResult {
  stepsPromoted: number;
  maturity: AdaptorMaturity;
  message: string;
}

/**
 * Process a discovery session and merge its steps into the adaptor.
 */
export async function processDiscoverySession(
  adaptorId: string,
  session: DiscoverySession
): Promise<ProcessingResult> {
  const db = getDb();

  // Get all discovery sessions for this adaptor (including the one just submitted)
  const sessionsResult = await db.query(
    `SELECT steps, extraction_hints
     FROM discovery_sessions
     WHERE adaptor_id = $1
     ORDER BY completed_at DESC
     LIMIT 20`,
    [adaptorId]
  );

  const allSessions = sessionsResult.rows.map((r) => ({
    steps: (typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps) as DiscoveredStep[],
    extractionHints: r.extraction_hints
      ? (typeof r.extraction_hints === 'string' ? JSON.parse(r.extraction_hints) : r.extraction_hints) as ExtractionHints
      : null,
  }));

  // Align steps across sessions
  const alignedSteps = alignDiscoveredSteps(allSessions.map((s) => s.steps));

  // Determine which steps have enough consensus to promote
  const promotableSteps = alignedSteps.filter(
    (aligned) => aligned.sessionCount >= DISCOVERY_QUORUM
  );

  // Get current adaptor definition
  const adaptorResult = await db.query(
    'SELECT definition FROM adaptors WHERE id = $1',
    [adaptorId]
  );
  if (adaptorResult.rows.length === 0) {
    return { stepsPromoted: 0, maturity: 'skeleton', message: 'Adaptor not found' };
  }

  const definition = adaptorResult.rows[0].definition;
  const existingStepIds = new Set(
    (definition.steps || []).map((s: any) => s.id)
  );

  // Promote steps
  let promoted = 0;
  const now = new Date().toISOString();

  for (const aligned of promotableSteps) {
    const stepId = aligned.canonicalId;
    if (existingStepIds.has(stepId)) {
      // Step already in definition — update confidence and contributor count
      const stepIdx = definition.steps.findIndex((s: any) => s.id === stepId);
      if (stepIdx >= 0) {
        definition.steps[stepIdx].confidence = Math.min(
          1,
          aligned.sessionCount / (aligned.sessionCount + 2) // Bayesian-ish
        );
        definition.steps[stepIdx].contributorCount = aligned.sessionCount;
        definition.steps[stepIdx].lastVerified = now;

        // Update selectors if the consensus selector is different
        if (aligned.bestWaitSelector) {
          definition.steps[stepIdx].waitForSelector = aligned.bestWaitSelector;
        }
        if (aligned.bestFallbacks.length > 0) {
          definition.steps[stepIdx].fallbackWaitSelectors = aligned.bestFallbacks;
        }
      }
    } else {
      // New step — promote it into the definition
      const newStep = {
        id: stepId,
        name: aligned.bestName,
        urlPattern: aligned.urlPattern,
        waitForSelector: aligned.bestWaitSelector,
        fallbackWaitSelectors: aligned.bestFallbacks,
        fields: aligned.mergedFields.map((f) => ({
          selector: f.selector,
          fallbackSelectors: f.fallbackSelectors,
          labelMatch: f.label || undefined,
          profilePath: f.suggestedProfilePath || '',
          action: f.suggestedAction || 'type',
        })),
        nextAction: aligned.bestNextButton
          ? { selector: aligned.bestNextButton.selector, text: aligned.bestNextButton.text, action: 'click' as const }
          : { action: 'click' as const },
        timeout: 15000,
        confidence: aligned.sessionCount / (aligned.sessionCount + 2),
        lastVerified: now,
        contributorCount: aligned.sessionCount,
        failureCount: 0,
      };

      // Insert at the correct ordinal position
      definition.steps.splice(aligned.ordinal, 0, newStep);
      promoted++;
    }
  }

  // Merge extraction hints
  const extractionHints = allSessions
    .map((s) => s.extractionHints)
    .filter(Boolean) as ExtractionHints[];

  if (extractionHints.length > 0) {
    const mergedExtraction = mergeExtractionHints(extractionHints);
    definition.extractionRules = {
      ...definition.extractionRules,
      ...mergedExtraction,
      confidence: extractionHints.length / (extractionHints.length + 2),
      lastVerified: now,
    };
  }

  // Update version and save
  definition.version = (definition.version || 1) + 1;
  definition.updatedAt = now;

  await db.query(
    `UPDATE adaptors
     SET definition = $1, version = $2, updated_at = NOW()
     WHERE id = $3`,
    [JSON.stringify(definition), definition.version, adaptorId]
  );

  // Determine maturity
  const maturity = calculateMaturity(definition);

  const totalSessions = allSessions.length;
  let message: string;
  if (totalSessions === 1) {
    message = `First discovery session recorded! ${session.steps.length} steps discovered. Need ${DISCOVERY_QUORUM - 1} more session(s) to start auto-promoting steps.`;
  } else if (promoted > 0) {
    message = `${promoted} new step(s) promoted into the adaptor definition. Maturity: ${maturity}.`;
  } else {
    message = `Session recorded. ${promotableSteps.length} step(s) have reached consensus. Maturity: ${maturity}.`;
  }

  return { stepsPromoted: promoted, maturity, message };
}

// ---------------------------------------------------------------------------
// Step alignment algorithm
// ---------------------------------------------------------------------------

interface AlignedStep {
  canonicalId: string;
  ordinal: number;
  urlPattern: string | undefined;
  bestName: string;
  bestWaitSelector: string;
  bestFallbacks: string[];
  mergedFields: MergedField[];
  bestNextButton: { selector: string; text: string } | undefined;
  sessionCount: number; // how many sessions contributed to this step
}

interface MergedField {
  selector: string;
  fallbackSelectors: string[];
  label: string;
  suggestedAction: string | undefined;
  suggestedProfilePath: string | undefined;
  confirmations: number;
}

/**
 * Align steps from multiple discovery sessions by comparing
 * URL patterns and field fingerprints.
 */
function alignDiscoveredSteps(
  sessionSteps: DiscoveredStep[][]
): AlignedStep[] {
  if (sessionSteps.length === 0) return [];

  // Use the longest session as the reference flow
  const refSession = sessionSteps.reduce((longest, s) =>
    s.length > longest.length ? s : longest
  );

  const aligned: AlignedStep[] = [];

  for (let i = 0; i < refSession.length; i++) {
    const refStep = refSession[i];

    // Find matching steps in other sessions
    let matchCount = 1; // count the reference session
    const matchingSteps: DiscoveredStep[] = [refStep];

    for (const otherSession of sessionSteps) {
      if (otherSession === refSession) continue;

      // Try to find a step in the other session that matches
      const match = findMatchingStep(refStep, otherSession);
      if (match) {
        matchCount++;
        matchingSteps.push(match);
      }
    }

    // Merge matching steps
    const canonicalId = deriveStepId(refStep, i);
    const mergedFields = mergeFields(matchingSteps);

    // Pick the most common wait selector
    const selectorVotes = countVotes(
      matchingSteps.map((s) => s.waitForSelector).filter(Boolean)
    );
    const bestWaitSelector = selectorVotes[0]?.[0] || refStep.waitForSelector;

    // Pick the most common next button
    const buttonVotes = countVotes(
      matchingSteps
        .map((s) => s.nextButton ? JSON.stringify(s.nextButton) : null)
        .filter(Boolean) as string[]
    );
    const bestNextButton = buttonVotes[0]
      ? JSON.parse(buttonVotes[0][0])
      : refStep.nextButton;

    // Pick the most descriptive name
    const nameVotes = countVotes(
      matchingSteps.map((s) => s.suggestedName).filter(Boolean)
    );
    const bestName = nameVotes[0]?.[0] || refStep.suggestedName || `Step ${i + 1}`;

    aligned.push({
      canonicalId,
      ordinal: i,
      urlPattern: refStep.pageUrl
        ? escapeUrlAsPattern(refStep.pageUrl)
        : undefined,
      bestName,
      bestWaitSelector,
      bestFallbacks: refStep.fallbackWaitSelectors || [],
      mergedFields,
      bestNextButton,
      sessionCount: matchCount,
    });
  }

  return aligned;
}

/**
 * Find a step in a session that matches a reference step.
 * Matching criteria:
 * - Same URL pattern (normalized)
 * - OR overlapping field fingerprints (>50% shared labels/names)
 */
function findMatchingStep(
  refStep: DiscoveredStep,
  session: DiscoveredStep[]
): DiscoveredStep | null {
  const refUrl = normaliseUrlPattern(refStep.pageUrl);
  const refFingerprint = getFieldFingerprint(refStep);

  let bestMatch: DiscoveredStep | null = null;
  let bestScore = 0;

  for (const step of session) {
    let score = 0;

    // URL match
    if (normaliseUrlPattern(step.pageUrl) === refUrl && refUrl) {
      score += 2;
    }

    // Field fingerprint overlap
    const stepFingerprint = getFieldFingerprint(step);
    const overlap = fingerPrintOverlap(refFingerprint, stepFingerprint);
    score += overlap * 3; // weight field overlap higher

    if (score > bestScore && score >= 1) {
      bestScore = score;
      bestMatch = step;
    }
  }

  return bestMatch;
}

function getFieldFingerprint(step: DiscoveredStep): Set<string> {
  const fp = new Set<string>();
  for (const field of step.fields) {
    if (field.label) fp.add(field.label.toLowerCase().trim());
    if (field.name) fp.add(`name:${field.name}`);
    if (field.id) fp.add(`id:${field.id}`);
  }
  return fp;
}

function fingerPrintOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared++;
  }
  return shared / Math.max(a.size, b.size);
}

/**
 * Merge field discoveries from multiple sessions into a consensus set.
 */
function mergeFields(steps: DiscoveredStep[]): MergedField[] {
  const fieldMap = new Map<string, MergedField>();

  for (const step of steps) {
    for (const field of step.fields) {
      // Use label + name as the merge key
      const key = `${field.label?.toLowerCase().trim() || ''}::${field.name || field.id}`;

      if (fieldMap.has(key)) {
        const existing = fieldMap.get(key)!;
        existing.confirmations++;
        // Prefer selector with more specificity
        if (field.selector.startsWith('#') && !existing.selector.startsWith('#')) {
          existing.selector = field.selector;
        }
        // Merge fallbacks
        for (const fb of field.fallbackSelectors || []) {
          if (!existing.fallbackSelectors.includes(fb)) {
            existing.fallbackSelectors.push(fb);
          }
        }
      } else {
        fieldMap.set(key, {
          selector: field.selector,
          fallbackSelectors: field.fallbackSelectors || [],
          label: field.label || '',
          suggestedAction: field.suggestedAction,
          suggestedProfilePath: field.suggestedProfilePath,
          confirmations: 1,
        });
      }
    }
  }

  return Array.from(fieldMap.values());
}

/**
 * Merge extraction hints from multiple sessions.
 */
function mergeExtractionHints(hints: ExtractionHints[]): Partial<{
  premiumSelectors: string[];
  excessSelectors: string[];
  inclusionSelectors: string[];
}> {
  const premiumSelectors: string[] = [];
  const excessSelectors: string[] = [];
  const inclusionSelectors: string[] = [];

  for (const hint of hints) {
    if (hint.premiumSelector && !premiumSelectors.includes(hint.premiumSelector)) {
      premiumSelectors.push(hint.premiumSelector);
    }
    if (hint.excessSelector && !excessSelectors.includes(hint.excessSelector)) {
      excessSelectors.push(hint.excessSelector);
    }
    if (hint.inclusionSelectors) {
      for (const sel of hint.inclusionSelectors) {
        if (!inclusionSelectors.includes(sel)) inclusionSelectors.push(sel);
      }
    }
  }

  return {
    ...(premiumSelectors.length > 0 ? { premiumSelectors } : {}),
    ...(excessSelectors.length > 0 ? { excessSelectors } : {}),
    ...(inclusionSelectors.length > 0 ? { inclusionSelectors } : {}),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveStepId(step: DiscoveredStep, ordinal: number): string {
  // Use the suggested name to derive a stable ID
  const name = step.suggestedName || `step-${ordinal}`;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '')
    .replace(/^-+/, '')
    .slice(0, 40);
}

function normaliseUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function escapeUrlAsPattern(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/\./g, '\\.')}${parsed.pathname.replace(/\//g, '\\/')}`;
  } catch {
    return url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

function countVotes(items: string[]): Array<[string, number]> {
  const votes = new Map<string, number>();
  for (const item of items) {
    votes.set(item, (votes.get(item) || 0) + 1);
  }
  return Array.from(votes.entries()).sort((a, b) => b[1] - a[1]);
}

function calculateMaturity(definition: any): AdaptorMaturity {
  const steps = definition.steps || [];
  if (steps.length === 0) return 'skeleton';

  const avgConfidence =
    steps.reduce((sum: number, s: any) => sum + (s.confidence || 0), 0) / steps.length;
  const maxContributors = Math.max(
    ...steps.map((s: any) => s.contributorCount || 0),
    0
  );

  if (avgConfidence >= 0.7 && maxContributors >= 5) return 'stable';
  if (avgConfidence >= 0.3 && maxContributors >= 3) return 'usable';
  if (maxContributors >= 2) return 'emerging';
  return 'discovered';
}

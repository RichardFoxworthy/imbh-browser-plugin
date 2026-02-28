/**
 * Adaptor Runtime
 *
 * Hydrates JSON AdaptorDefinition documents into usable runtime objects.
 * Handles loading from cache, seed data, or the central service.
 * Provides the bridge between the new JSON-based adaptors and the
 * existing automation engine interface.
 */

import { getCachedAdaptor, getAllCachedAdaptors, cacheAdaptor } from './adaptor-cache';
import type { AdaptorDefinition, AdaptorStep, ExtractionRules } from './types';
import type { QuoteResult, AdapterHealth, ProductType } from '../adapters/types';

// Seed adaptors bundled with the extension (offline fallback)
import budgetDirectHomeSeed from './seed/budget-direct-home.json';

const SEED_ADAPTORS: AdaptorDefinition[] = [
  budgetDirectHomeSeed as unknown as AdaptorDefinition,
  // Add more seeds as they're created
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get an adaptor by ID, checking cache first, then seed data.
 */
export async function getAdaptorDefinition(
  adaptorId: string
): Promise<AdaptorDefinition | null> {
  // Try cache first (has latest crowd-sourced version)
  const cached = await getCachedAdaptor(adaptorId);
  if (cached) return cached;

  // Fall back to bundled seed data
  const seed = SEED_ADAPTORS.find((s) => s.id === adaptorId);
  if (seed) {
    // Cache the seed for consistency
    await cacheAdaptor(seed);
    return seed;
  }

  return null;
}

/**
 * Get all available adaptor definitions.
 */
export async function getAllAdaptorDefinitions(): Promise<AdaptorDefinition[]> {
  const cached = await getAllCachedAdaptors();

  // Merge with seeds: cached versions take precedence
  const cachedIds = new Set(cached.map((a) => a.id));
  const seeds = SEED_ADAPTORS.filter((s) => !cachedIds.has(s.id));

  return [...cached, ...seeds];
}

/**
 * Get adaptors filtered by product type.
 */
export async function getAdaptorsByProduct(
  productType: ProductType
): Promise<AdaptorDefinition[]> {
  const all = await getAllAdaptorDefinitions();
  return all.filter((a) => a.productType === productType && a.enabled);
}

/**
 * Create a quote extractor function from extraction rules.
 * This replaces the per-adapter extractQuote() method.
 */
export function createQuoteExtractor(
  definition: AdaptorDefinition
): (doc: Document) => QuoteResult | null {
  const rules = definition.extractionRules;

  return (doc: Document) => {
    // Extract premium
    let premiumText: string | null = null;
    for (const sel of rules.premiumSelectors) {
      const el = doc.querySelector(sel);
      if (el?.textContent) {
        premiumText = el.textContent;
        break;
      }
    }

    if (!premiumText) return null;

    const premiumMatch = premiumText.match(/\$?([\d,]+(?:\.\d{2})?)/);
    if (!premiumMatch) return null;
    const annual = parseFloat(premiumMatch[1].replace(/,/g, ''));

    // Extract excess
    let excess = 0;
    for (const sel of rules.excessSelectors) {
      const el = doc.querySelector(sel);
      if (el?.textContent) {
        const excessMatch = el.textContent.match(/\$?([\d,]+)/);
        if (excessMatch) {
          excess = parseFloat(excessMatch[1].replace(/,/g, ''));
        }
        break;
      }
    }

    // Extract inclusions
    const inclusions: string[] = [];
    for (const sel of rules.inclusionSelectors) {
      doc.querySelectorAll(sel).forEach((el) => {
        if (el.textContent) inclusions.push(el.textContent.trim());
      });
      if (inclusions.length > 0) break;
    }

    // Extract exclusions
    const exclusions: string[] = [];
    for (const sel of rules.exclusionSelectors || []) {
      doc.querySelectorAll(sel).forEach((el) => {
        if (el.textContent) exclusions.push(el.textContent.trim());
      });
      if (exclusions.length > 0) break;
    }

    return {
      provider: definition.provider,
      product: `${definition.provider} ${definition.productType}`,
      premium: { annual },
      excess,
      inclusions,
      exclusions,
      retrievedAt: new Date().toISOString(),
      sourceUrl: doc.location?.href || '',
      raw: { premiumText: premiumText || '' },
    };
  };
}

/**
 * Run a health check for an adaptor (HTTP reachability check).
 */
export async function checkAdaptorHealth(
  definition: AdaptorDefinition
): Promise<AdapterHealth> {
  try {
    await fetch(definition.startUrl, {
      method: 'HEAD',
      mode: 'no-cors',
    });

    return {
      status: 'healthy',
      lastChecked: new Date().toISOString(),
      message: `${definition.provider} is reachable`,
    };
  } catch (err) {
    return {
      status: 'broken',
      lastChecked: new Date().toISOString(),
      message: `${definition.provider} is not reachable`,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Calculate overall adaptor confidence based on step-level confidence scores.
 */
export function getAdaptorConfidence(definition: AdaptorDefinition): number {
  if (definition.steps.length === 0) return 0;

  const total = definition.steps.reduce((sum, step) => sum + step.confidence, 0);
  return total / definition.steps.length;
}

/**
 * Get steps sorted for execution, with low-confidence steps flagged.
 */
export function getExecutableSteps(
  definition: AdaptorDefinition
): Array<AdaptorStep & { autoFillReliable: boolean }> {
  return definition.steps.map((step) => ({
    ...step,
    autoFillReliable: step.confidence >= 0.3,
  }));
}

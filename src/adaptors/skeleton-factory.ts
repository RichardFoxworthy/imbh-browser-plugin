/**
 * Skeleton Adaptor Factory
 *
 * Creates minimal AdaptorDefinition documents from just a URL,
 * provider name, and product type. The resulting "skeleton" has
 * zero steps and empty extraction rules — everything is populated
 * later through crowdsourced discovery.
 */

import type {
  AdaptorDefinition,
  ExtractionRules,
  SkeletonAdaptorRequest,
  AdaptorMaturity,
} from './types';
import type { ProductType } from '../adapters/types';

/**
 * Derive a stable adaptor ID from the provider name and product type.
 * e.g. 'Suncorp' + 'home' → 'suncorp-home'
 */
export function deriveAdaptorId(provider: string, productType: ProductType): string {
  return `${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}-${productType}`;
}

/**
 * Create a skeleton adaptor definition with zero knowledge.
 * This is the starting point for crowdsourced discovery.
 */
export function createSkeletonAdaptor(request: SkeletonAdaptorRequest): AdaptorDefinition {
  const id = deriveAdaptorId(request.provider, request.productType);
  const now = new Date().toISOString();

  const emptyExtractionRules: ExtractionRules = {
    premiumSelectors: [],
    excessSelectors: [],
    inclusionSelectors: [],
    exclusionSelectors: [],
    confidence: 0,
    lastVerified: now,
  };

  return {
    id,
    version: 1,
    provider: request.provider,
    productType: request.productType,
    logoUrl: request.logoUrl || '',
    startUrl: normaliseStartUrl(request.startUrl),
    enabled: true,
    updatedAt: now,
    steps: [],
    extractionRules: emptyExtractionRules,
  };
}

/**
 * Determine the maturity level of an adaptor based on its steps
 * and their confidence scores.
 */
export function getAdaptorMaturity(adaptor: AdaptorDefinition): AdaptorMaturity {
  if (adaptor.steps.length === 0) return 'skeleton';

  const avgConfidence =
    adaptor.steps.reduce((sum, s) => sum + s.confidence, 0) / adaptor.steps.length;
  const totalContributors = Math.max(
    ...adaptor.steps.map((s) => s.contributorCount),
    0
  );

  if (avgConfidence >= 0.7 && totalContributors >= 5) return 'stable';
  if (avgConfidence >= 0.3 && totalContributors >= 3) return 'usable';
  if (totalContributors >= 2) return 'emerging';
  return 'discovered';
}

/**
 * Check if an adaptor is a skeleton (zero-knowledge starting point).
 */
export function isSkeleton(adaptor: AdaptorDefinition): boolean {
  return adaptor.steps.length === 0;
}

/**
 * Normalise a start URL: ensure https, strip query params and fragments.
 */
function normaliseStartUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Force https
    parsed.protocol = 'https:';
    // Strip query and fragment
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

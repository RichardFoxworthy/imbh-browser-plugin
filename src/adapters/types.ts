import type { UserProfile } from '../profile/types';

export interface FieldMapping {
  selector: string;
  fallbackSelectors: string[];
  labelMatch?: string;
  profilePath: string;
  action: 'type' | 'select' | 'click' | 'radio' | 'checkbox' | 'typeAndSelect';
  transform?: ((value: any) => string) | string; // string form for serialisation
}

export interface ActionMapping {
  selector?: string;
  text?: string;
  action: 'click' | 'submit';
}

export interface AdapterStep {
  name: string;
  waitForSelector: string;
  fields: FieldMapping[];
  nextAction: ActionMapping;
  timeout: number;
}

export interface QuoteResult {
  provider: string;
  product: string;
  premium: { annual: number; monthly?: number };
  excess: number;
  inclusions: string[];
  exclusions: string[];
  retrievedAt: string;
  sourceUrl: string;
  raw: Record<string, string>;
}

export type AdapterHealth = {
  status: 'healthy' | 'degraded' | 'broken';
  lastChecked: string;
  message: string;
  error?: string;
};

export type ProductType = 'home' | 'contents' | 'home-and-contents' | 'motor';

export interface InsuranceAdapter {
  id: string;
  name: string;
  provider: string;
  productType: ProductType;
  logoUrl: string;
  startUrl: string;
  enabled: boolean;

  getSteps(profile: UserProfile): AdapterStep[];
  extractQuote(document: Document): QuoteResult | null;
  healthCheck(): Promise<AdapterHealth>;
}

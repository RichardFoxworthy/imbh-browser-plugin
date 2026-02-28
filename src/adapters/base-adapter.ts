import type { InsuranceAdapter, AdapterHealth, ProductType } from './types';

export interface BaseAdapterConfig {
  id: string;
  name: string;
  provider: string;
  productType: ProductType;
  logoUrl: string;
  startUrl: string;
}

/**
 * Base class for insurance adapters.
 * Provides shared health check logic and sensible defaults.
 */
export abstract class BaseAdapter implements InsuranceAdapter {
  id: string;
  name: string;
  provider: string;
  productType: ProductType;
  logoUrl: string;
  startUrl: string;
  enabled: boolean = true;

  constructor(config: BaseAdapterConfig) {
    this.id = config.id;
    this.name = config.name;
    this.provider = config.provider;
    this.productType = config.productType;
    this.logoUrl = config.logoUrl;
    this.startUrl = config.startUrl;
  }

  abstract getSteps(profile: any): any[];
  abstract extractQuote(doc: Document): any;

  async healthCheck(): Promise<AdapterHealth> {
    try {
      const response = await fetch(this.startUrl, {
        method: 'HEAD',
        mode: 'no-cors',
      });

      return {
        status: 'healthy',
        lastChecked: new Date().toISOString(),
        message: `${this.name} is reachable`,
      };
    } catch (err) {
      return {
        status: 'broken',
        lastChecked: new Date().toISOString(),
        message: `${this.name} is not reachable`,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }
}

import type { InsuranceAdapter, ProductType } from './types';
import { BudgetDirectHomeAdapter } from './home/budget-direct';
import { NrmaHomeAdapter } from './home/nrma';
import { AamiHomeAdapter } from './home/aami';
import { AllianzHomeAdapter } from './home/allianz';
import { YouiHomeAdapter } from './home/youi';
import { BudgetDirectMotorAdapter } from './motor/budget-direct';
import { NrmaMotorAdapter } from './motor/nrma';
import { AamiMotorAdapter } from './motor/aami';

class AdapterRegistry {
  private adapters: Map<string, InsuranceAdapter> = new Map();

  constructor() {
    this.register(new BudgetDirectHomeAdapter());
    this.register(new NrmaHomeAdapter());
    this.register(new AamiHomeAdapter());
    this.register(new AllianzHomeAdapter());
    this.register(new YouiHomeAdapter());
    this.register(new BudgetDirectMotorAdapter());
    this.register(new NrmaMotorAdapter());
    this.register(new AamiMotorAdapter());
  }

  register(adapter: InsuranceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): InsuranceAdapter | undefined {
    return this.adapters.get(id);
  }

  getAll(): InsuranceAdapter[] {
    return Array.from(this.adapters.values());
  }

  getByProductType(type: ProductType): InsuranceAdapter[] {
    return this.getAll().filter((a) => a.productType === type || a.productType === 'home-and-contents');
  }

  getEnabled(): InsuranceAdapter[] {
    return this.getAll().filter((a) => a.enabled);
  }

  getHomeAdapters(): InsuranceAdapter[] {
    return this.getAll().filter(
      (a) => a.productType === 'home' || a.productType === 'contents' || a.productType === 'home-and-contents'
    );
  }

  getMotorAdapters(): InsuranceAdapter[] {
    return this.getAll().filter((a) => a.productType === 'motor');
  }
}

export const adapterRegistry = new AdapterRegistry();

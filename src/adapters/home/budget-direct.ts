import { BaseAdapter } from '../base-adapter';
import type { AdapterStep, QuoteResult } from '../types';
import type { UserProfile } from '../../profile/types';

/**
 * Budget Direct Home & Contents Insurance adapter.
 *
 * NOTE: CSS selectors are placeholders that need to be verified against the live site.
 * The form structure and selectors will change over time — use the adapter health
 * monitoring system to detect when updates are needed.
 */
export class BudgetDirectHomeAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'budget-direct-home',
      name: 'Budget Direct Home & Contents',
      provider: 'Budget Direct',
      productType: 'home-and-contents',
      logoUrl: '',
      startUrl: 'https://www.budgetdirect.com.au/home-insurance/get-quote.html',
    });
  }

  getSteps(profile: UserProfile): AdapterStep[] {
    const home = profile.home;
    if (!home) return [];

    return [
      {
        name: 'Property Address',
        waitForSelector: '[data-step="address"], #address-search, input[name*="address"]',
        fields: [
          {
            selector: '#address-search',
            fallbackSelectors: [
              'input[name*="address"]',
              'input[placeholder*="address"]',
              '[data-testid="address-input"]',
            ],
            labelMatch: 'property address',
            profilePath: 'personal.currentAddress',
            action: 'typeAndSelect',
            transform: ((addr: any) =>
              `${addr.unit ? addr.unit + '/' : ''}${addr.streetNumber} ${addr.streetName}, ${addr.suburb} ${addr.state} ${addr.postcode}`
            ).toString(),
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },
      {
        name: 'Property Details',
        waitForSelector: '[data-step="property"], .property-details, form',
        fields: [
          {
            selector: 'select[name*="propertyType"], #property-type',
            fallbackSelectors: ['[data-testid="property-type"]'],
            labelMatch: 'property type',
            profilePath: 'home.propertyType',
            action: 'select',
          },
          {
            selector: 'select[name*="construction"], #construction-type',
            fallbackSelectors: ['[data-testid="construction"]'],
            labelMatch: 'construction type',
            profilePath: 'home.constructionType',
            action: 'select',
          },
          {
            selector: 'select[name*="roofType"], #roof-type',
            fallbackSelectors: ['[data-testid="roof-type"]'],
            labelMatch: 'roof',
            profilePath: 'home.roofType',
            action: 'select',
          },
          {
            selector: 'input[name*="yearBuilt"], #year-built',
            fallbackSelectors: ['[data-testid="year-built"]'],
            labelMatch: 'year built',
            profilePath: 'home.yearBuilt',
            action: 'type',
          },
          {
            selector: 'select[name*="bedrooms"], #bedrooms',
            fallbackSelectors: ['[data-testid="bedrooms"]'],
            labelMatch: 'bedrooms',
            profilePath: 'home.numberOfBedrooms',
            action: 'select',
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },
      {
        name: 'Security & Features',
        waitForSelector: '[data-step="security"], .security-features, form',
        fields: [
          {
            selector: 'input[name*="alarm"], #security-alarm',
            fallbackSelectors: ['[data-testid="alarm"]'],
            labelMatch: 'security alarm',
            profilePath: 'home.securityAlarm',
            action: 'radio',
            transform: ((v: boolean) => (v ? 'yes' : 'no')).toString(),
          },
          {
            selector: 'input[name*="deadlock"], #deadlocks',
            fallbackSelectors: ['[data-testid="deadlocks"]'],
            labelMatch: 'deadlock',
            profilePath: 'home.deadlocks',
            action: 'radio',
            transform: ((v: boolean) => (v ? 'yes' : 'no')).toString(),
          },
          {
            selector: 'input[name*="pool"], #swimming-pool',
            fallbackSelectors: ['[data-testid="pool"]'],
            labelMatch: 'swimming pool',
            profilePath: 'home.swimmingPool',
            action: 'radio',
            transform: ((v: boolean) => (v ? 'yes' : 'no')).toString(),
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },
      {
        name: 'Cover Details',
        waitForSelector: '[data-step="cover"], .cover-details, form',
        fields: [
          {
            selector: 'input[name*="buildingSum"], #building-sum',
            fallbackSelectors: ['[data-testid="building-sum"]'],
            labelMatch: 'building sum insured',
            profilePath: 'home.buildingSumInsured',
            action: 'type',
          },
          {
            selector: 'input[name*="contentsSum"], #contents-sum',
            fallbackSelectors: ['[data-testid="contents-sum"]'],
            labelMatch: 'contents sum insured',
            profilePath: 'home.contentsSumInsured',
            action: 'type',
          },
          {
            selector: 'select[name*="excess"], #excess',
            fallbackSelectors: ['[data-testid="excess"]'],
            labelMatch: 'excess',
            profilePath: 'home.excessPreference',
            action: 'select',
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },
      {
        name: 'Personal Details',
        waitForSelector: '[data-step="personal"], .personal-details, form',
        fields: [
          {
            selector: 'input[name*="firstName"], #first-name',
            fallbackSelectors: ['[data-testid="first-name"]'],
            labelMatch: 'first name',
            profilePath: 'personal.firstName',
            action: 'type',
          },
          {
            selector: 'input[name*="lastName"], #last-name',
            fallbackSelectors: ['[data-testid="last-name"]'],
            labelMatch: 'last name',
            profilePath: 'personal.lastName',
            action: 'type',
          },
          {
            selector: 'input[name*="dob"], input[name*="dateOfBirth"], #dob',
            fallbackSelectors: ['[data-testid="dob"]'],
            labelMatch: 'date of birth',
            profilePath: 'personal.dateOfBirth',
            action: 'type',
          },
          {
            selector: 'input[name*="email"], #email',
            fallbackSelectors: ['[data-testid="email"]'],
            labelMatch: 'email',
            profilePath: 'personal.email',
            action: 'type',
          },
          {
            selector: 'input[name*="phone"], #phone',
            fallbackSelectors: ['[data-testid="phone"]'],
            labelMatch: 'phone',
            profilePath: 'personal.phone',
            action: 'type',
          },
        ],
        nextAction: {
          selector: 'button[type="submit"], button.get-quote, button.calculate',
          action: 'click',
        },
        timeout: 15000,
      },
    ];
  }

  extractQuote(doc: Document): QuoteResult | null {
    // Selectors are placeholders — need verification against live site
    const premiumSelectors = [
      '.quote-premium .amount',
      '.annual-premium',
      '[data-testid="premium-amount"]',
      '.premium-display .price',
      '.quote-result .price',
    ];

    const excessSelectors = [
      '.excess-amount',
      '[data-testid="excess-amount"]',
      '.excess .amount',
    ];

    let premiumText: string | null = null;
    for (const sel of premiumSelectors) {
      const el = doc.querySelector(sel);
      if (el) {
        premiumText = el.textContent;
        break;
      }
    }

    if (!premiumText) return null;

    const premiumMatch = premiumText.match(/\$?([\d,]+(?:\.\d{2})?)/);
    if (!premiumMatch) return null;

    const annual = parseFloat(premiumMatch[1].replace(/,/g, ''));

    let excess = 0;
    for (const sel of excessSelectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const excessMatch = (el.textContent || '').match(/\$?([\d,]+)/);
        if (excessMatch) {
          excess = parseFloat(excessMatch[1].replace(/,/g, ''));
        }
        break;
      }
    }

    const inclusions: string[] = [];
    const inclusionEls = doc.querySelectorAll('.cover-includes li, .inclusions li, [data-testid="inclusion"]');
    inclusionEls.forEach((el) => {
      if (el.textContent) inclusions.push(el.textContent.trim());
    });

    return {
      provider: 'Budget Direct',
      product: 'Home & Contents Insurance',
      premium: { annual },
      excess,
      inclusions,
      exclusions: [],
      retrievedAt: new Date().toISOString(),
      sourceUrl: doc.location?.href || '',
      raw: { premiumText: premiumText || '' },
    };
  }
}

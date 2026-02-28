import { BaseAdapter } from '../base-adapter';
import type { AdapterStep, QuoteResult } from '../types';
import type { UserProfile } from '../../profile/types';

/**
 * Youi Home & Contents Insurance adapter.
 *
 * STUB: All CSS selectors are placeholders and need to be verified against the
 * live site. This adapter is a minimal scaffold — implement real selectors and
 * form-flow logic before use.
 */
export class YouiHomeAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'youi-home',
      name: 'Youi Home & Contents',
      provider: 'Youi',
      productType: 'home-and-contents',
      logoUrl: '',
      startUrl: 'https://www.youi.com.au/home-insurance/quote',
    });
  }

  getSteps(profile: UserProfile): AdapterStep[] {
    const home = profile.home;
    if (!home) return [];

    return [
      // Step 1 — Property Address
      {
        name: 'Property Address',
        waitForSelector: 'input[name*="address"], #address-search, [data-step="address"]',
        fields: [
          {
            selector: 'input[name*="address"]',
            fallbackSelectors: [
              '#address-search',
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

      // Step 2 — Property Details
      {
        name: 'Property Details',
        waitForSelector: '[data-step="property"], .property-details, form',
        fields: [
          {
            selector: 'select[name*="propertyType"]',
            fallbackSelectors: ['#property-type', '[data-testid="property-type"]'],
            labelMatch: 'property type',
            profilePath: 'home.propertyType',
            action: 'select',
          },
          {
            selector: 'select[name*="construction"]',
            fallbackSelectors: ['#construction-type', '[data-testid="construction"]'],
            labelMatch: 'construction type',
            profilePath: 'home.constructionType',
            action: 'select',
          },
          {
            selector: 'select[name*="roofType"]',
            fallbackSelectors: ['#roof-type', '[data-testid="roof-type"]'],
            labelMatch: 'roof',
            profilePath: 'home.roofType',
            action: 'select',
          },
          {
            selector: 'input[name*="yearBuilt"]',
            fallbackSelectors: ['#year-built', '[data-testid="year-built"]'],
            labelMatch: 'year built',
            profilePath: 'home.yearBuilt',
            action: 'type',
          },
          {
            selector: 'select[name*="bedrooms"]',
            fallbackSelectors: ['#bedrooms', '[data-testid="bedrooms"]'],
            labelMatch: 'bedrooms',
            profilePath: 'home.numberOfBedrooms',
            action: 'select',
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },

      // Step 3 — Security & Features
      {
        name: 'Security & Features',
        waitForSelector: '[data-step="security"], .security-features, form',
        fields: [
          {
            selector: 'input[name*="alarm"]',
            fallbackSelectors: ['#security-alarm', '[data-testid="alarm"]'],
            labelMatch: 'security alarm',
            profilePath: 'home.securityAlarm',
            action: 'radio',
            transform: ((v: boolean) => (v ? 'yes' : 'no')).toString(),
          },
          {
            selector: 'input[name*="deadlock"]',
            fallbackSelectors: ['#deadlocks', '[data-testid="deadlocks"]'],
            labelMatch: 'deadlock',
            profilePath: 'home.deadlocks',
            action: 'radio',
            transform: ((v: boolean) => (v ? 'yes' : 'no')).toString(),
          },
          {
            selector: 'input[name*="pool"]',
            fallbackSelectors: ['#swimming-pool', '[data-testid="pool"]'],
            labelMatch: 'swimming pool',
            profilePath: 'home.swimmingPool',
            action: 'radio',
            transform: ((v: boolean) => (v ? 'yes' : 'no')).toString(),
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },

      // Step 4 — Cover Amounts
      {
        name: 'Cover Amounts',
        waitForSelector: '[data-step="cover"], .cover-details, form',
        fields: [
          {
            selector: 'input[name*="buildingSum"]',
            fallbackSelectors: ['#building-sum', '[data-testid="building-sum"]'],
            labelMatch: 'building sum insured',
            profilePath: 'home.buildingSumInsured',
            action: 'type',
          },
          {
            selector: 'input[name*="contentsSum"]',
            fallbackSelectors: ['#contents-sum', '[data-testid="contents-sum"]'],
            labelMatch: 'contents sum insured',
            profilePath: 'home.contentsSumInsured',
            action: 'type',
          },
          {
            selector: 'select[name*="excess"]',
            fallbackSelectors: ['#excess', '[data-testid="excess"]'],
            labelMatch: 'excess',
            profilePath: 'home.excessPreference',
            action: 'select',
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },

      // Step 5 — Personal Details
      {
        name: 'Personal Details',
        waitForSelector: '[data-step="personal"], .personal-details, form',
        fields: [
          {
            selector: 'input[name*="firstName"]',
            fallbackSelectors: ['#first-name', '[data-testid="first-name"]'],
            labelMatch: 'first name',
            profilePath: 'personal.firstName',
            action: 'type',
          },
          {
            selector: 'input[name*="lastName"]',
            fallbackSelectors: ['#last-name', '[data-testid="last-name"]'],
            labelMatch: 'last name',
            profilePath: 'personal.lastName',
            action: 'type',
          },
          {
            selector: 'input[name*="dob"], input[name*="dateOfBirth"]',
            fallbackSelectors: ['#dob', '[data-testid="dob"]'],
            labelMatch: 'date of birth',
            profilePath: 'personal.dateOfBirth',
            action: 'type',
          },
          {
            selector: 'input[name*="email"]',
            fallbackSelectors: ['#email', '[data-testid="email"]'],
            labelMatch: 'email',
            profilePath: 'personal.email',
            action: 'type',
          },
          {
            selector: 'input[name*="phone"]',
            fallbackSelectors: ['#phone', '[data-testid="phone"]'],
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
    // TODO: Replace placeholder selectors with real ones from the Youi quote results page
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
      provider: 'Youi',
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

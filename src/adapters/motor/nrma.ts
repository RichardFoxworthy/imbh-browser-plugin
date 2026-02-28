import { BaseAdapter } from '../base-adapter';
import type { AdapterStep, QuoteResult } from '../types';
import type { UserProfile } from '../../profile/types';

/**
 * NRMA Motor (Car) Insurance adapter.
 *
 * STUB: All CSS selectors are placeholders and need to be verified against the
 * live site. This adapter is a minimal scaffold — implement real selectors and
 * form‑flow logic before use.
 */
export class NrmaMotorAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'nrma-motor',
      name: 'NRMA Motor',
      provider: 'NRMA',
      productType: 'motor',
      logoUrl: '',
      startUrl: 'https://www.nrma.com.au/car-insurance/get-quote',
    });
  }

  getSteps(profile: UserProfile): AdapterStep[] {
    const motor = profile.motor;
    if (!motor) return [];

    return [
      // Step 1 — Vehicle Details
      {
        name: 'Vehicle Details',
        waitForSelector: '[data-step="vehicle"], .vehicle-details, form',
        fields: [
          {
            selector: 'input[name*="rego"], #registration',
            fallbackSelectors: [
              'input[placeholder*="rego"]',
              '[data-testid="registration-input"]',
            ],
            labelMatch: 'registration',
            profilePath: 'motor.registrationNumber',
            action: 'type',
          },
          {
            selector: 'select[name*="year"], #vehicle-year',
            fallbackSelectors: ['[data-testid="vehicle-year"]'],
            labelMatch: 'year',
            profilePath: 'motor.year',
            action: 'select',
          },
          {
            selector: 'select[name*="make"], #vehicle-make',
            fallbackSelectors: ['[data-testid="vehicle-make"]'],
            labelMatch: 'make',
            profilePath: 'motor.make',
            action: 'select',
          },
          {
            selector: 'select[name*="model"], #vehicle-model',
            fallbackSelectors: ['[data-testid="vehicle-model"]'],
            labelMatch: 'model',
            profilePath: 'motor.model',
            action: 'select',
          },
          {
            selector: 'select[name*="variant"], #vehicle-variant',
            fallbackSelectors: ['[data-testid="vehicle-variant"]'],
            labelMatch: 'variant',
            profilePath: 'motor.variant',
            action: 'select',
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },

      // Step 2 — Driver Details
      {
        name: 'Driver Details',
        waitForSelector: '[data-step="driver"], .driver-details, form',
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
            selector: 'input[name*="dob"], input[name*="dateOfBirth"]',
            fallbackSelectors: ['#dob', '[data-testid="dob"]'],
            labelMatch: 'date of birth',
            profilePath: 'personal.dateOfBirth',
            action: 'type',
          },
          {
            selector: 'select[name*="licenceType"], #licence-type',
            fallbackSelectors: ['[data-testid="licence-type"]'],
            labelMatch: 'licence type',
            profilePath: 'motor.licenceType',
            action: 'select',
          },
          {
            selector: 'input[name*="licenceYears"], #licence-years',
            fallbackSelectors: ['[data-testid="licence-years"]'],
            labelMatch: 'years on licence',
            profilePath: 'motor.yearsLicenced',
            action: 'type',
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },

      // Step 3 — Cover Preferences
      {
        name: 'Cover Preferences',
        waitForSelector: '[data-step="cover"], .cover-options, form',
        fields: [
          {
            selector: 'select[name*="coverType"], #cover-type',
            fallbackSelectors: ['[data-testid="cover-type"]'],
            labelMatch: 'cover type',
            profilePath: 'motor.coverType',
            action: 'select',
          },
          {
            selector: 'select[name*="excess"], #excess',
            fallbackSelectors: ['[data-testid="excess"]'],
            labelMatch: 'excess',
            profilePath: 'motor.excessPreference',
            action: 'select',
          },
          {
            selector: 'input[name*="agreedValue"], #agreed-value',
            fallbackSelectors: ['[data-testid="agreed-value"]'],
            labelMatch: 'agreed value',
            profilePath: 'motor.agreedValue',
            action: 'type',
          },
        ],
        nextAction: { selector: 'button[type="submit"], button.continue', action: 'click' },
        timeout: 15000,
      },

      // Step 4 — Personal Details & Address
      {
        name: 'Personal Details',
        waitForSelector: '[data-step="personal"], .personal-details, form',
        fields: [
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
          {
            selector: 'input[name*="address"], #address-search',
            fallbackSelectors: [
              'input[placeholder*="address"]',
              '[data-testid="address-input"]',
            ],
            labelMatch: 'address',
            profilePath: 'personal.currentAddress',
            action: 'typeAndSelect',
            transform: ((addr: any) =>
              `${addr.unit ? addr.unit + '/' : ''}${addr.streetNumber} ${addr.streetName}, ${addr.suburb} ${addr.state} ${addr.postcode}`
            ).toString(),
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
    // TODO: Replace placeholder selectors with real ones from the NRMA motor quote results page
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
      provider: 'NRMA',
      product: 'Car Insurance',
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

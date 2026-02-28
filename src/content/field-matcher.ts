/**
 * Field matcher: maps profile data to DOM form fields.
 * Uses a cascade of strategies:
 *   1. Primary CSS selector
 *   2. Fallback CSS selectors
 *   3. Label-text fuzzy matching
 */

import { fuzzyMatch, normaliseLabel, randomDelay } from '../shared/utils';
import { waitForElement } from './dom-observer';
import type { FieldMapping } from '../adapters/types';

/** Find a form field element using the cascade of matching strategies. */
export async function findField(mapping: FieldMapping): Promise<Element | null> {
  // Strategy 1: Primary selector
  let el = await waitForElement(mapping.selector, { timeout: 3000 });
  if (el) return el;

  // Strategy 2: Fallback selectors
  for (const fallback of mapping.fallbackSelectors) {
    el = await waitForElement(fallback, { timeout: 2000 });
    if (el) return el;
  }

  // Strategy 3: Label-based fuzzy matching
  if (mapping.labelMatch) {
    el = findByLabel(mapping.labelMatch);
    if (el) return el;
  }

  return null;
}

/** Find a form input by matching its associated label text. */
function findByLabel(labelText: string): Element | null {
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    const text = label.textContent || '';
    if (fuzzyMatch(text, labelText)) {
      // Try `for` attribute
      const forAttr = label.getAttribute('for');
      if (forAttr) {
        const input = document.getElementById(forAttr);
        if (input) return input;
      }
      // Try nested input
      const nested = label.querySelector('input, select, textarea');
      if (nested) return nested;
      // Try next sibling
      const sibling = label.nextElementSibling;
      if (sibling && (sibling.tagName === 'INPUT' || sibling.tagName === 'SELECT' || sibling.tagName === 'TEXTAREA')) {
        return sibling;
      }
    }
  }

  // Also check aria-label and placeholder
  const inputs = document.querySelectorAll('input, select, textarea');
  for (const input of inputs) {
    const ariaLabel = input.getAttribute('aria-label') || '';
    const placeholder = input.getAttribute('placeholder') || '';
    const name = input.getAttribute('name') || '';
    if (
      fuzzyMatch(ariaLabel, labelText) ||
      fuzzyMatch(placeholder, labelText) ||
      fuzzyMatch(name, labelText)
    ) {
      return input;
    }
  }

  return null;
}

/**
 * Fill a form field with the given value, simulating human-like interaction.
 */
export async function fillField(
  element: Element,
  value: string,
  action: FieldMapping['action']
): Promise<boolean> {
  try {
    const el = element as HTMLElement;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomDelay(200, 500);
    el.focus();

    switch (action) {
      case 'type':
        return await typeValue(el as HTMLInputElement, value);
      case 'select':
        return selectDropdownValue(el as HTMLSelectElement, value);
      case 'click':
        el.click();
        return true;
      case 'radio':
        return clickRadioByValue(el, value);
      case 'checkbox':
        return setCheckbox(el as HTMLInputElement, value === 'true');
      case 'typeAndSelect':
        return await typeAndSelect(el as HTMLInputElement, value);
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/** Type a value character by character with random delays. */
async function typeValue(input: HTMLInputElement, value: string): Promise<boolean> {
  // Clear existing value
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));

  for (const char of value) {
    input.value += char;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    await randomDelay(50, 150);
  }

  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

/** Select a value from a <select> dropdown. */
function selectDropdownValue(select: HTMLSelectElement, value: string): boolean {
  // Try exact value match
  const option = Array.from(select.options).find(
    (opt) => opt.value === value || normaliseLabel(opt.text) === normaliseLabel(value)
  );

  if (option) {
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Fuzzy match on option text
  const fuzzyOption = Array.from(select.options).find((opt) =>
    fuzzyMatch(opt.text, value)
  );

  if (fuzzyOption) {
    select.value = fuzzyOption.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}

/** Click a radio button matching the given value. */
function clickRadioByValue(container: Element, value: string): boolean {
  const radios = container.querySelectorAll('input[type="radio"]');
  for (const radio of radios) {
    const r = radio as HTMLInputElement;
    if (r.value === value) {
      r.click();
      r.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // Check associated label
    const label = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
    if (label && fuzzyMatch(label.textContent || '', value)) {
      r.click();
      r.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

/** Set a checkbox to the desired state. */
function setCheckbox(input: HTMLInputElement, checked: boolean): boolean {
  if (input.checked !== checked) {
    input.click();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

/**
 * Type a value into an autocomplete field, wait for suggestions, and select the first match.
 * Used for address lookup fields.
 */
async function typeAndSelect(input: HTMLInputElement, value: string): Promise<boolean> {
  await typeValue(input, value);
  // Wait for autocomplete suggestions
  await randomDelay(1500, 3000);

  // Look for suggestion dropdown
  const suggestions = document.querySelectorAll(
    '[role="option"], [role="listbox"] li, .autocomplete-suggestion, .suggestion-item, .pac-item'
  );

  if (suggestions.length > 0) {
    (suggestions[0] as HTMLElement).click();
    await randomDelay(500, 1000);
    return true;
  }

  // Try pressing Enter as fallback
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await randomDelay(500, 1000);
  return true;
}

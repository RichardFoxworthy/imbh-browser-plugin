/**
 * Handles step-by-step navigation through multi-page insurance forms.
 * Detects "next"/"continue" buttons and manages page transitions.
 */

import { waitForElement, waitForPageStable, waitForElementRemoved } from './dom-observer';
import { randomDelay } from '../shared/utils';

/** Common selectors for "next step" buttons across insurer sites. */
const NEXT_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button.continue',
  'button.next',
  'a.continue',
  'a.next',
  '[data-testid="continue"]',
  '[data-testid="next"]',
  'button:has(span)',
];

/** Common text patterns for next/continue buttons. */
const NEXT_BUTTON_TEXT = [
  'continue',
  'next',
  'next step',
  'get quote',
  'get my quote',
  'calculate',
  'proceed',
  'go',
];

/** Common selectors for loading indicators. */
const LOADING_SELECTORS = [
  '.loading',
  '.spinner',
  '[role="progressbar"]',
  '.loader',
  '[data-loading="true"]',
];

/**
 * Find and click the "next" / "continue" button using an explicit selector
 * or by scanning for common patterns.
 */
export async function clickNext(explicitSelector?: string): Promise<boolean> {
  // Try explicit selector first
  if (explicitSelector) {
    const el = await waitForElement(explicitSelector, { timeout: 5000 });
    if (el) {
      await clickWithHumanDelay(el as HTMLElement);
      return true;
    }
  }

  // Scan for common next button patterns
  for (const selector of NEXT_BUTTON_SELECTORS) {
    const buttons = document.querySelectorAll(selector);
    for (const btn of buttons) {
      const text = (btn.textContent || '').toLowerCase().trim();
      if (NEXT_BUTTON_TEXT.some((t) => text.includes(t))) {
        await clickWithHumanDelay(btn as HTMLElement);
        return true;
      }
    }
  }

  // Last resort: find any visible button with matching text
  const allButtons = document.querySelectorAll('button, a[role="button"], input[type="submit"]');
  for (const btn of allButtons) {
    const text = (btn.textContent || '').toLowerCase().trim();
    if (NEXT_BUTTON_TEXT.some((t) => text.includes(t)) && isVisible(btn as HTMLElement)) {
      await clickWithHumanDelay(btn as HTMLElement);
      return true;
    }
  }

  return false;
}

/** Click an element with human-like delay. */
async function clickWithHumanDelay(el: HTMLElement): Promise<void> {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await randomDelay(300, 800);
  el.click();
}

/** Check if an element is visible on the page. */
function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetParent !== null
  );
}

/**
 * Wait for a page transition to complete.
 * Handles both full page loads and SPA-style transitions.
 */
export async function waitForPageTransition(timeout: number = 15000): Promise<void> {
  // Wait for any loading indicators to disappear
  for (const selector of LOADING_SELECTORS) {
    if (document.querySelector(selector)) {
      await waitForElementRemoved(selector, timeout);
    }
  }

  // Wait for DOM to stabilise
  await waitForPageStable(1500);
}

/**
 * Detect CAPTCHA challenges on the current page.
 */
export function detectCaptcha(): boolean {
  // Cloudflare Turnstile: check the response input FIRST. The container
  // elements (.cf-turnstile, [data-sitekey], iframes) persist in the DOM
  // even after the challenge is solved. The response input having a value
  // is the definitive signal that the challenge is complete.
  const turnstileResponse = document.querySelector<HTMLInputElement>(
    'input[name="cf-turnstile-response"]'
  );
  if (turnstileResponse) {
    // Input exists: challenge is active only if the response is empty
    return !turnstileResponse.value;
  }

  // Cloudflare managed challenge page (full-page interstitial)
  if (document.querySelector('#challenge-running') || document.querySelector('#challenge-stage')) {
    return true;
  }

  // Other CAPTCHA providers
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '.g-recaptcha',
    '.h-captcha',
    '#captcha',
    '[data-captcha]',
    'iframe[title*="challenge"]',
  ];

  return captchaSelectors.some((sel) => document.querySelector(sel) !== null);
}

/**
 * Detect if the current page shows a quote result (end of form).
 */
export function detectQuotePage(quoteSelectors: string[]): boolean {
  return quoteSelectors.some((sel) => document.querySelector(sel) !== null);
}

/** Common selectors for modal/popup close buttons. */
const MODAL_CLOSE_SELECTORS = [
  // ng-bootstrap (Budget Direct, etc.)
  'ngb-modal-window .modal__header button',
  'ngb-modal-window .modal-header button',
  'ngb-modal-window button.close',
  // Bootstrap generic
  '.modal .close',
  '.modal [aria-label="Close"]',
  '.modal button.close',
  '.modal-header .close',
  'button.modal-close',
  // Class-based patterns
  '[class*="modal"] [class*="close"]',
  '[class*="modal"] button[aria-label="Close"]',
  '[class*="popup"] [class*="close"]',
  '[class*="overlay"] [class*="close"]',
  '[class*="dialog"] [class*="close"]',
  // Generic dialog close buttons
  '[role="dialog"] button',
];

/** Keywords in class/id/text that indicate a live chat or contact widget (not a blocking modal). */
const CHAT_WIDGET_PATTERNS = [
  'chat', 'livechat', 'live-chat', 'contact-us', 'contactus',
  'intercom', 'zendesk', 'drift', 'hubspot', 'crisp', 'tawk',
  'freshchat', 'olark', 'helpshift', 'genesys', 'salesforce-chat',
];

/** Check if an element or its ancestors look like a chat/contact widget. */
function isChatWidget(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    const cls = (node.getAttribute('class') || '').toLowerCase();
    const id = (node.getAttribute('id') || '').toLowerCase();
    if (CHAT_WIDGET_PATTERNS.some((p) => cls.includes(p) || id.includes(p))) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Dismiss any visible modal/popup overlays that might block form interaction.
 * Skips live chat / contact-us widgets that aren't blocking the form.
 * Returns true if a modal was dismissed.
 */
export function dismissModals(): boolean {
  let dismissed = false;

  for (const sel of MODAL_CLOSE_SELECTORS) {
    const buttons = document.querySelectorAll(sel);
    for (const btn of buttons) {
      const el = btn as HTMLElement;
      if (!isVisible(el)) continue;

      // Skip chat/contact widgets — these aren't blocking modals
      if (isChatWidget(el)) continue;

      const text = (el.textContent || '').trim();
      // Click buttons that look like close/dismiss (×, X, Close, or empty icon buttons)
      if (text === '×' || text === 'X' || text === '' || text.toLowerCase() === 'close'
        || text.toLowerCase().includes('dismiss') || text.toLowerCase().includes('no thanks')) {
        el.click();
        dismissed = true;
      }
    }
  }

  return dismissed;
}

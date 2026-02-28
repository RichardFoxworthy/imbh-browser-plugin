/**
 * MutationObserver wrapper for detecting dynamic form changes.
 * Insurance forms frequently add/remove fields based on previous answers.
 */

export interface DomObserverOptions {
  /** Root element to observe. Defaults to document.body. */
  root?: Element;
  /** Timeout in ms to wait for a selector to appear. */
  timeout?: number;
}

/**
 * Wait for an element matching `selector` to appear in the DOM.
 * Uses MutationObserver so it works with dynamically-rendered forms.
 */
export function waitForElement(
  selector: string,
  options: DomObserverOptions = {}
): Promise<Element | null> {
  const { root = document.body, timeout = 15000 } = options;

  return new Promise((resolve) => {
    // Already present?
    const existing = root.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
    }

    observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        cleanup();
        resolve(el);
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeout);
  });
}

/**
 * Wait for the page to become stable (no DOM mutations for `quietMs` milliseconds).
 */
export function waitForPageStable(quietMs: number = 1000): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, quietMs);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Start the initial timer in case the page is already stable
    timer = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, quietMs);
  });
}

/**
 * Wait until a specific element is removed from the DOM.
 * Useful for waiting for loading spinners to disappear.
 */
export function waitForElementRemoved(
  selector: string,
  timeout: number = 15000
): Promise<boolean> {
  return new Promise((resolve) => {
    // Already gone?
    if (!document.querySelector(selector)) {
      resolve(true);
      return;
    }

    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
    }

    observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        cleanup();
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeout);
  });
}

/**
 * Isolated-world content script that runs at document_start.
 * Reads the fingerprint session from chrome.storage.session and
 * sets data attributes on <html> for the MAIN-world spoof script to read.
 *
 * Built as a standalone IIFE.
 */

(async function () {
  try {
    const result = await chrome.storage.session.get('fingerprintSession');
    const session = result.fingerprintSession as
      | { userAgent?: string; platform?: string }
      | undefined;
    if (session?.userAgent) {
      document.documentElement.dataset.fpUa = session.userAgent;
    }
    if (session?.platform) {
      document.documentElement.dataset.fpPlatform = session.platform;
    }
  } catch {
    // storage.session may not be available — non-critical
  }
})();

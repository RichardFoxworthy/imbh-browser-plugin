/**
 * Clears per-origin browsing data (cookies, localStorage, cache, etc.)
 * before opening an insurer tab so visits aren't linkable across runs.
 */
export async function clearSiteData(origin: string): Promise<void> {
  await chrome.browsingData.remove(
    { origins: [origin] },
    {
      cookies: true,
      localStorage: true,
      cache: true,
      indexedDB: true,
      serviceWorkers: true,
    },
  );
}

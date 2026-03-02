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

/**
 * Remove all cookies for a base domain (all subdomains).
 * This covers cross-origin redirects (e.g. www.example.com → secure.example.com)
 * that browsingData.remove with an explicit origin would miss.
 */
export async function clearDomainCookies(baseDomain: string): Promise<void> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: baseDomain });
    await Promise.all(
      cookies.map((c) => {
        const protocol = c.secure ? 'https' : 'http';
        const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
        return chrome.cookies.remove({
          url: `${protocol}://${domain}${c.path}`,
          name: c.name,
        });
      }),
    );
  } catch {
    // cookies permission may not be granted — non-fatal
  }
}

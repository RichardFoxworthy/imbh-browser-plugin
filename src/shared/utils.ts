/** Returns a promise that resolves after a random delay in the given range. */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Resolves a dot-notation path against an object. e.g. "personal.firstName" */
export function resolvePath(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/** Sets a value at a dot-notation path, creating intermediate objects as needed. */
export function setPath(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] == null || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

/** Normalise text for fuzzy label matching: lowercase, strip punctuation and extra spaces. */
export function normaliseLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple fuzzy match: check if all words in `needle` appear in `haystack`. */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  const h = normaliseLabel(haystack);
  const words = normaliseLabel(needle).split(' ');
  return words.every((w) => h.includes(w));
}

/** Generate a unique ID. */
export function uid(): string {
  return crypto.randomUUID();
}

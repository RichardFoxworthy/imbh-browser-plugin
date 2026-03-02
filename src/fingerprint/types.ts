export interface FingerprintSession {
  /** Random 32-bit int, changes per quote run */
  seed: number;
  /** Selected UA string for this run */
  userAgent: string;
  /** Matching platform (e.g. "Win32", "MacIntel") */
  platform: string;
}

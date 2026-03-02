import type { QuoteRunStatus } from '../quoting/types';

export const statusIcons: Record<QuoteRunStatus, string> = {
  pending: '\u23F3',
  running: '\u25B6',
  completed: '\u2705',
  error: '\u274C',
  declined: '\uD83D\uDEAB',
  'paused-captcha': '\u26A0\uFE0F',
  'paused-unknown-field': '\uD83D\uDC46',
  skipped: '\u23ED',
};

export const statusColors: Record<QuoteRunStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-600',
  completed: 'text-green-600',
  error: 'text-red-600',
  declined: 'text-orange-600',
  'paused-captcha': 'text-amber-600',
  'paused-unknown-field': 'text-blue-500',
  skipped: 'text-gray-500',
};

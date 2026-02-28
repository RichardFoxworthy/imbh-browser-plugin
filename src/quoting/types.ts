import type { QuoteResult } from '../adapters/types';

export type QuoteRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'paused-captcha'
  | 'paused-unknown-field'
  | 'skipped';

export interface QuoteRunItem {
  adapterId: string;
  adapterName: string;
  provider: string;
  status: QuoteRunStatus;
  progress: number; // 0-100
  message: string;
  result: QuoteResult | null;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface QuoteRun {
  id: string;
  items: QuoteRunItem[];
  startedAt: string;
  completedAt?: string;
  productType: 'home' | 'motor';
}

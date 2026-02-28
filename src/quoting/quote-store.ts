import { getDb } from '../storage/db';
import type { QuoteResult } from '../adapters/types';
import { uid } from '../shared/utils';

export async function saveQuoteResult(result: QuoteResult): Promise<void> {
  const db = await getDb();
  await db.put('quotes', {
    id: uid(),
    provider: result.provider,
    productType: result.product,
    data: JSON.stringify(result),
    retrievedAt: result.retrievedAt,
  });
}

export async function getRecentQuotes(limit: number = 50): Promise<QuoteResult[]> {
  const db = await getDb();
  const records = await db.getAll('quotes');

  return records
    .sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt))
    .slice(0, limit)
    .map((r) => JSON.parse(r.data) as QuoteResult);
}

export async function getQuotesByProvider(provider: string): Promise<QuoteResult[]> {
  const db = await getDb();
  const records = await db.getAllFromIndex('quotes', 'by-provider', provider);
  return records.map((r) => JSON.parse(r.data) as QuoteResult);
}

export async function clearAllQuotes(): Promise<void> {
  const db = await getDb();
  await db.clear('quotes');
}

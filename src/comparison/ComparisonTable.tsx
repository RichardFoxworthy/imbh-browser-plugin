import React, { useState } from 'react';
import { QuoteCard } from './QuoteCard';
import { FilterControls } from './FilterControls';
import type { QuoteResult } from '../adapters/types';

interface Props {
  quotes: QuoteResult[];
}

export type SortField = 'premium' | 'excess' | 'provider';
export type SortDirection = 'asc' | 'desc';

export function ComparisonTable({ quotes }: Props) {
  const [sortField, setSortField] = useState<SortField>('premium');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...quotes].sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'premium':
        return (a.premium.annual - b.premium.annual) * dir;
      case 'excess':
        return (a.excess - b.excess) * dir;
      case 'provider':
        return a.provider.localeCompare(b.provider) * dir;
      default:
        return 0;
    }
  });

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function exportCsv() {
    const headers = ['Provider', 'Product', 'Annual Premium', 'Excess', 'Inclusions'];
    const rows = sorted.map((q) => [
      q.provider,
      q.product,
      q.premium.annual.toString(),
      q.excess.toString(),
      q.inclusions.join('; '),
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insurance-quotes-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(sorted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insurance-quotes-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (quotes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No quotes yet</p>
        <p className="text-sm mt-1">
          Run a quote comparison from the extension popup to see results here.
        </p>
      </div>
    );
  }

  const cheapest = sorted[0]?.premium.annual;

  return (
    <div className="space-y-4">
      <FilterControls
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onExportCsv={exportCsv}
        onExportJson={exportJson}
        quoteCount={quotes.length}
      />

      <div className="space-y-3">
        {sorted.map((quote, idx) => (
          <QuoteCard
            key={`${quote.provider}-${quote.retrievedAt}`}
            quote={quote}
            rank={idx + 1}
            isCheapest={quote.premium.annual === cheapest}
            isExpanded={expandedId === `${quote.provider}-${quote.retrievedAt}`}
            onToggleExpand={() =>
              setExpandedId(
                expandedId === `${quote.provider}-${quote.retrievedAt}`
                  ? null
                  : `${quote.provider}-${quote.retrievedAt}`
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

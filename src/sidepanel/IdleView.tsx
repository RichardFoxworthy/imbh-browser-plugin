import React, { useState, useEffect } from 'react';
import { ComparisonTable } from '../comparison/ComparisonTable';
import { getRecentQuotes } from '../quoting/quote-store';
import type { QuoteResult } from '../adapters/types';

export function IdleView() {
  const [quotes, setQuotes] = useState<QuoteResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecentQuotes()
      .then(setQuotes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (quotes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No quotes yet</p>
        <p className="text-sm mt-1">
          Open the extension popup and click "Get Quotes" to start comparing insurance prices.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Previous Quotes</h2>
      <ComparisonTable quotes={quotes} />
    </div>
  );
}

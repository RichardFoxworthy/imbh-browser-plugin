import React, { useState, useEffect } from 'react';
import { ComparisonTable } from '../comparison/ComparisonTable';
import { getRecentQuotes } from '../quoting/quote-store';
import type { QuoteResult } from '../adapters/types';

export function SidePanel() {
  const [quotes, setQuotes] = useState<QuoteResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuotes();

    // Listen for new quotes being added
    function handleMessage(message: any) {
      if (
        message.type === 'QUOTE_ITEM_UPDATE' &&
        message.item?.status === 'completed' &&
        message.item?.result
      ) {
        setQuotes((prev) => [...prev, message.item.result]);
      }
      if (message.type === 'QUOTE_RUN_COMPLETE') {
        loadQuotes(); // Refresh all
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  async function loadQuotes() {
    try {
      const results = await getRecentQuotes();
      setQuotes(results);
    } catch {
      // IndexedDB might not be ready yet
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold">Quote Comparison</h1>
        <p className="text-xs text-blue-200">
          {quotes.length} quote{quotes.length !== 1 ? 's' : ''} retrieved
        </p>
      </header>

      <main className="p-4">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading quotes...</div>
        ) : (
          <ComparisonTable quotes={quotes} />
        )}
      </main>
    </div>
  );
}

import React from 'react';
import { Card } from '../shared/ui/Card';
import type { QuoteResult } from '../adapters/types';

interface Props {
  quote: QuoteResult;
  rank: number;
  isCheapest: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function QuoteCard({ quote, rank, isCheapest, isExpanded, onToggleExpand }: Props) {
  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${
        isCheapest ? 'ring-2 ring-green-500' : ''
      }`}
    >
      <div onClick={onToggleExpand}>
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-400 w-6 text-center">
              {rank}
            </span>
            <div>
              <div className="font-semibold text-gray-900">{quote.provider}</div>
              <div className="text-xs text-gray-500">{quote.product}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-gray-900">
              ${quote.premium.annual.toLocaleString()}
              <span className="text-sm font-normal text-gray-500">/yr</span>
            </div>
            {quote.premium.monthly && (
              <div className="text-xs text-gray-500">
                ${quote.premium.monthly.toLocaleString()}/mo
              </div>
            )}
          </div>
        </div>

        {/* Summary row */}
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
          <span>Excess: ${quote.excess.toLocaleString()}</span>
          {isCheapest && (
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              Cheapest
            </span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t space-y-3">
          {quote.inclusions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Inclusions</h4>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {quote.inclusions.map((inc, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="text-green-500">+</span> {inc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quote.exclusions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Exclusions</h4>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {quote.exclusions.map((exc, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="text-red-500">-</span> {exc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-gray-400">
              Retrieved: {new Date(quote.retrievedAt).toLocaleString()}
            </span>
            <a
              href={quote.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View on {quote.provider} &rarr;
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}

import React from 'react';
import { Button } from '../shared/ui/Button';
import { AdapterProgressCard } from './AdapterProgressCard';
import type { AdapterProgress } from './AdapterProgressCard';
import type { QuoteRunItem } from '../quoting/types';

interface Props {
  items: QuoteRunItem[];
  stepProgressMap: Record<string, AdapterProgress>;
  tabIdMap: Record<string, number>;
  isComplete: boolean;
  onViewResults: () => void;
}

export function ProgressView({ items, stepProgressMap, tabIdMap, isComplete, onViewResults }: Props) {
  const completed = items.filter((i) => i.status === 'completed').length;
  const total = items.length;
  const hasResults = completed > 0;

  const needsAttention = items.filter(
    (i) => i.status === 'paused-captcha' || i.status === 'paused-unknown-field'
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Getting Quotes</h2>
        <span className="text-sm text-gray-500">
          {completed}/{total} complete
        </span>
      </div>

      {/* Global progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {/* Attention banner */}
      {needsAttention.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <div className="text-sm font-medium text-amber-800">
            Manual input needed
          </div>
          <div className="text-xs text-amber-700 mt-0.5">
            {needsAttention.map((i) => i.provider).join(', ')} — click "Go to tab" below
          </div>
        </div>
      )}

      {/* Adapter cards */}
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        {items.map((item) => (
          <AdapterProgressCard
            key={item.adapterId}
            item={item}
            stepProgress={stepProgressMap[item.adapterId]}
            tabId={tabIdMap[item.adapterId]}
          />
        ))}
      </div>

      {/* Actions */}
      {isComplete && (
        <div className="space-y-2">
          {hasResults ? (
            <Button onClick={onViewResults} className="w-full">
              Compare Results
            </Button>
          ) : (
            <p className="text-sm text-red-600 text-center">
              No quotes were retrieved successfully. Check the error messages above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Button } from '../shared/ui/Button';
import { ComparisonTable } from '../comparison/ComparisonTable';
import type { QuoteResult } from '../adapters/types';

interface Props {
  quotes: QuoteResult[];
  onBack: () => void;
}

export function ResultsView({ quotes, onBack }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Quote Comparison</h2>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
      <ComparisonTable quotes={quotes} />
    </div>
  );
}

import React from 'react';
import type { SortField, SortDirection } from './ComparisonTable';

interface Props {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  quoteCount: number;
}

export function FilterControls({
  sortField,
  sortDirection,
  onSort,
  onExportCsv,
  onExportJson,
  quoteCount,
}: Props) {
  const arrow = sortDirection === 'asc' ? '\u2191' : '\u2193';

  function sortButton(field: SortField, label: string) {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => onSort(field)}
        className={`px-2 py-1 text-xs rounded ${
          isActive
            ? 'bg-blue-100 text-blue-700 font-medium'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        {label} {isActive && arrow}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-1">Sort:</span>
        {sortButton('premium', 'Premium')}
        {sortButton('excess', 'Excess')}
        {sortButton('provider', 'Provider')}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{quoteCount} quotes</span>
        <div className="flex gap-1">
          <button
            onClick={onExportCsv}
            className="text-xs text-blue-600 hover:underline"
          >
            CSV
          </button>
          <button
            onClick={onExportJson}
            className="text-xs text-blue-600 hover:underline"
          >
            JSON
          </button>
        </div>
      </div>
    </div>
  );
}

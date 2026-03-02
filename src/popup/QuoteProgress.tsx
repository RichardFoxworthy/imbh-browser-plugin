import React, { useState, useEffect } from 'react';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { statusIcons, statusColors } from '../shared/status-config';
import type { QuoteRunItem } from '../quoting/types';

interface Props {
  onComplete: () => void;
}

export function QuoteProgress({ onComplete }: Props) {
  const [items, setItems] = useState<QuoteRunItem[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    // Get initial state
    chrome.runtime.sendMessage({ type: 'GET_QUOTE_RUN_STATUS' }, (response) => {
      if (response?.run) {
        setItems(response.run.items);
        if (response.run.completedAt) setIsComplete(true);
      }
    });

    // Listen for updates
    function handleMessage(message: any) {
      if (message.type === 'QUOTE_ITEM_UPDATE') {
        setItems((prev) =>
          prev.map((item) =>
            item.adapterId === message.item.adapterId ? message.item : item
          )
        );
      }
      if (message.type === 'QUOTE_RUN_COMPLETE') {
        setIsComplete(true);
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const completed = items.filter((i) => i.status === 'completed').length;
  const total = items.length;
  const hasResults = completed > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Getting Quotes</h2>
        <span className="text-sm text-gray-500">
          {completed}/{total} complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {/* Item list */}
      <div className="space-y-2 max-h-[320px] overflow-y-auto">
        {items.map((item) => (
          <Card key={item.adapterId} className="!p-3">
            <div className="flex items-center gap-2">
              <span className={`text-lg ${statusColors[item.status]}`}>
                {statusIcons[item.status]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {item.provider}
                </div>
                <div className={`text-xs ${statusColors[item.status]}`}>
                  {item.status === 'error' && item.error ? item.error : item.message}
                </div>
              </div>
              {item.result && (
                <div className="text-sm font-bold text-green-700">
                  ${item.result.premium.annual.toLocaleString()}/yr
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Actions */}
      {isComplete && (
        <div className="space-y-2">
          {hasResults && (
            <Button onClick={onComplete} className="w-full">
              Compare Results
            </Button>
          )}
          {!hasResults && (
            <p className="text-sm text-red-600 text-center">
              No quotes were retrieved successfully. Check the error messages above.
            </p>
          )}
        </div>
      )}

      {!isComplete && (
        <p className="text-xs text-gray-400 text-center">
          Please keep this window open while quotes are being retrieved.
          You may be asked to help navigate unfamiliar form sections — your input
          helps improve the experience for all users.
        </p>
      )}
    </div>
  );
}

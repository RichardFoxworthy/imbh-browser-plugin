import React from 'react';
import { Card } from '../shared/ui/Card';
import { Button } from '../shared/ui/Button';
import { statusIcons, statusColors } from '../shared/status-config';
import type { QuoteRunItem } from '../quoting/types';

export interface AdapterProgress {
  stepIndex: number;
  totalSteps: number;
  stepName: string;
}

interface Props {
  item: QuoteRunItem;
  stepProgress?: AdapterProgress;
  tabId?: number;
}

export function AdapterProgressCard({ item, stepProgress, tabId }: Props) {
  const needsAttention = item.status === 'paused-captcha' || item.status === 'paused-unknown-field';

  function handleGoToTab() {
    chrome.runtime.sendMessage({
      type: 'FOCUS_ADAPTER_TAB',
      adapterId: item.adapterId,
    });
  }

  return (
    <Card
      className={`!p-3 ${needsAttention ? 'ring-2 ring-amber-400' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-lg ${statusColors[item.status]}`}>
          {statusIcons[item.status]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">
            {item.provider}
          </div>

          {/* Step progress for running adapters */}
          {item.status === 'running' && stepProgress && (
            <div className="mt-1">
              <div className="text-xs text-gray-500">
                Step {stepProgress.stepIndex + 1}/{stepProgress.totalSteps}: {stepProgress.stepName}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1 mt-0.5">
                <div
                  className="bg-blue-400 h-1 rounded-full transition-all duration-300"
                  style={{
                    width: `${stepProgress.totalSteps > 0
                      ? ((stepProgress.stepIndex + 1) / stepProgress.totalSteps) * 100
                      : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Status message */}
          {!stepProgress && (
            <div className={`text-xs ${statusColors[item.status]}`}>
              {item.message}
            </div>
          )}

          {/* Attention callout */}
          {needsAttention && (
            <div className="mt-1 text-xs text-amber-700">
              {item.message}
            </div>
          )}
        </div>

        {/* Premium when completed */}
        {item.result && (
          <div className="text-sm font-bold text-green-700">
            ${item.result.premium.annual.toLocaleString()}/yr
          </div>
        )}

        {/* Go to tab button for paused adapters */}
        {needsAttention && tabId != null && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoToTab}
          >
            Go to tab
          </Button>
        )}
      </div>
    </Card>
  );
}

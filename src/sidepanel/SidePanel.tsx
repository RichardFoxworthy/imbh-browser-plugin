import React, { useState, useEffect, useCallback } from 'react';
import { ProgressView } from './ProgressView';
import { IdleView } from './IdleView';
import { ResultsView } from './ResultsView';
import type { AdapterProgress } from './AdapterProgressCard';
import type { QuoteRunItem } from '../quoting/types';
import type { QuoteResult } from '../adapters/types';

type View = 'idle' | 'progress' | 'results';

export function SidePanel() {
  const [view, setView] = useState<View>('idle');
  const [items, setItems] = useState<QuoteRunItem[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [stepProgressMap, setStepProgressMap] = useState<Record<string, AdapterProgress>>({});
  const [tabIdMap, setTabIdMap] = useState<Record<string, number>>({});
  const [completedQuotes, setCompletedQuotes] = useState<QuoteResult[]>([]);

  // Check for active run on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_QUOTE_RUN_STATUS' }, (response) => {
      if (response?.run) {
        setItems(response.run.items);
        if (response.run.completedAt) {
          setIsComplete(true);
          // Collect completed results
          const results = response.run.items
            .filter((i: QuoteRunItem) => i.status === 'completed' && i.result)
            .map((i: QuoteRunItem) => i.result!);
          setCompletedQuotes(results);
          setView('results');
        } else {
          setView('progress');
        }
      }
    });
  }, []);

  // Listen for messages
  useEffect(() => {
    function handleMessage(message: any) {
      if (message.type === 'QUOTE_ITEM_UPDATE') {
        setView('progress');
        setItems((prev) => {
          // If item exists, update it; otherwise append
          const exists = prev.some((i) => i.adapterId === message.item.adapterId);
          if (exists) {
            return prev.map((i) =>
              i.adapterId === message.item.adapterId ? message.item : i
            );
          }
          return [...prev, message.item];
        });

        // Track tab IDs
        if (message.tabId != null) {
          setTabIdMap((prev) => ({
            ...prev,
            [message.item.adapterId]: message.tabId,
          }));
        }

        // Collect completed quotes for results view
        if (message.item.status === 'completed' && message.item.result) {
          setCompletedQuotes((prev) => [...prev, message.item.result]);
        }
      }

      if (message.type === 'AUTOMATION_PROGRESS') {
        if (message.adapterId || message.adaptorId) {
          const id = message.adapterId || message.adaptorId;
          setStepProgressMap((prev) => ({
            ...prev,
            [id]: {
              stepIndex: message.stepIndex ?? 0,
              totalSteps: message.totalSteps ?? 0,
              stepName: message.stepName ?? '',
            },
          }));
        }
      }

      if (message.type === 'QUOTE_RUN_COMPLETE') {
        setIsComplete(true);
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleViewResults = useCallback(() => {
    setView('results');
  }, []);

  const handleBackToIdle = useCallback(() => {
    setView('idle');
    setItems([]);
    setIsComplete(false);
    setStepProgressMap({});
    setTabIdMap({});
    setCompletedQuotes([]);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold">Quote Compare</h1>
        <p className="text-xs text-blue-200">
          {view === 'progress' && !isComplete && 'Getting quotes...'}
          {view === 'progress' && isComplete && 'Quotes complete'}
          {view === 'results' && `${completedQuotes.length} quote${completedQuotes.length !== 1 ? 's' : ''} retrieved`}
          {view === 'idle' && 'Side panel'}
        </p>
      </header>

      <main className="p-4">
        {view === 'idle' && <IdleView />}
        {view === 'progress' && (
          <ProgressView
            items={items}
            stepProgressMap={stepProgressMap}
            tabIdMap={tabIdMap}
            isComplete={isComplete}
            onViewResults={handleViewResults}
          />
        )}
        {view === 'results' && (
          <ResultsView
            quotes={completedQuotes}
            onBack={handleBackToIdle}
          />
        )}
      </main>
    </div>
  );
}

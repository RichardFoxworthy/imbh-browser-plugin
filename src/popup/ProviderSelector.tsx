import React, { useState, useEffect } from 'react';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import type { UserProfile } from '../profile/types';

interface AdapterInfo {
  id: string;
  name: string;
  provider: string;
  productType: string;
  enabled: boolean;
  confidence?: number;   // 0–1, from crowdsourced adaptor system
  source?: 'crowdsourced' | 'legacy';
}

interface Props {
  profile: UserProfile | null;
  onStartQuoting: () => void;
}

export function ProviderSelector({ profile, onStartQuoting }: Props) {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [productType, setProductType] = useState<'home' | 'motor'>('home');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAdapters();
  }, [productType]);

  async function loadAdapters() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ADAPTERS',
        productType,
      });
      if (response?.adapters) {
        setAdapters(response.adapters);
        // Select all enabled adapters by default
        setSelected(new Set(response.adapters.filter((a: AdapterInfo) => a.enabled).map((a: AdapterInfo) => a.id)));
      }
    } catch {
      // Fallback for development — load from registry directly
      setAdapters([]);
    }
  }

  function toggleProvider(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(adapters.map((a) => a.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleStartQuoting() {
    if (!profile || selected.size === 0) return;

    setLoading(true);
    try {
      await chrome.runtime.sendMessage({
        type: 'START_QUOTE_RUN',
        adapterIds: Array.from(selected),
        profile,
        productType,
      });
      // Open side panel from popup context — requires user gesture which
      // we have here (button click handler). The service worker can't do
      // this reliably because it lacks a user gesture context.
      try {
        const win = await chrome.windows.getCurrent();
        await (chrome.sidePanel as any)?.open?.({ windowId: win.id });
      } catch {
        // Side panel API may not be available
      }
      onStartQuoting();
    } catch (err) {
      setLoading(false);
    }
  }

  const hasHome = !!profile?.home;
  const hasMotor = !!profile?.motor && profile.motor.length > 0;

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Get Quotes</h2>

      {!profile && (
        <p className="text-sm text-amber-600">
          Please create a profile first to start getting quotes.
        </p>
      )}

      {profile && (
        <>
          {/* Product type tabs */}
          <div className="flex border-b">
            {hasHome && (
              <button
                onClick={() => setProductType('home')}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${
                  productType === 'home'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Home & Contents
              </button>
            )}
            {hasMotor && (
              <button
                onClick={() => setProductType('motor')}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${
                  productType === 'motor'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Motor
              </button>
            )}
          </div>

          {/* Selection controls */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {selected.size} of {adapters.length} selected
            </span>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">
                Select all
              </button>
              <button onClick={selectNone} className="text-xs text-blue-600 hover:underline">
                Clear
              </button>
            </div>
          </div>

          {/* Provider list */}
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {adapters.map((adapter) => (
              <Card key={adapter.id} className="!p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(adapter.id)}
                    onChange={() => toggleProvider(adapter.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {adapter.provider}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {adapter.name}
                      {adapter.confidence != null && adapter.confidence < 0.5 && (
                        <span className="ml-1 text-amber-500" title="May need manual help">
                          — may need your help
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              </Card>
            ))}

            {adapters.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No providers available for this product type.
              </p>
            )}
          </div>

          {/* Start button */}
          <Button
            onClick={handleStartQuoting}
            disabled={selected.size === 0 || loading}
            className="w-full"
          >
            {loading
              ? 'Starting...'
              : `Get ${selected.size} Quote${selected.size !== 1 ? 's' : ''}`}
          </Button>

          <p className="text-xs text-gray-400 text-center">
            Each insurer's site will open in a background tab. This may take a few minutes.
          </p>
        </>
      )}
    </div>
  );
}

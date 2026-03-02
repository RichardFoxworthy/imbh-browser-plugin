/**
 * Add New Insurer — Zero-Knowledge Bootstrap UI
 *
 * Allows users to add any insurer not yet in the system by simply
 * providing the quote page URL. The plugin creates a skeleton adaptor
 * and opens the form in discovery mode.
 *
 * Flow:
 * 1. User enters insurer name, product type, and quote start URL
 * 2. Plugin creates a skeleton adaptor (locally + central API)
 * 3. Opens the URL in a new tab in full discovery mode
 * 4. User fills the form normally while we record everything
 * 5. On completion, the recorded flow is submitted as a discovery session
 * 6. Future users of this insurer get the crowdsourced adaptor
 */

import React, { useState } from 'react';
import { Button } from '../shared/ui/Button';
import { Input } from '../shared/ui/Input';
import { Select } from '../shared/ui/Select';
import type { ProductType } from '../adapters/types';

interface AddInsurerProps {
  onBack: () => void;
  onDiscoveryStarted: (adaptorId: string) => void;
}

const PRODUCT_OPTIONS = [
  { value: 'home', label: 'Home Insurance' },
  { value: 'contents', label: 'Contents Insurance' },
  { value: 'home-and-contents', label: 'Home & Contents' },
  { value: 'motor', label: 'Motor Insurance' },
];

type BootstrapStatus = 'idle' | 'creating' | 'opening' | 'error';

export function AddInsurer({ onBack, onDiscoveryStarted }: AddInsurerProps) {
  const [provider, setProvider] = useState('');
  const [productType, setProductType] = useState<ProductType>('home');
  const [startUrl, setStartUrl] = useState('');
  const [status, setStatus] = useState<BootstrapStatus>('idle');
  const [error, setError] = useState('');

  const isValid = provider.trim().length > 0 && startUrl.trim().length > 0 && isValidUrl(startUrl);

  async function handleStartDiscovery() {
    if (!isValid) return;

    setStatus('creating');
    setError('');

    try {
      // Step 1: Create the skeleton adaptor
      const bootstrapResult = await chrome.runtime.sendMessage({
        type: 'BOOTSTRAP_ADAPTOR',
        provider: provider.trim(),
        productType,
        startUrl: startUrl.trim(),
      });

      if (!bootstrapResult?.success) {
        throw new Error(bootstrapResult?.error || 'Failed to create adaptor');
      }

      const { adaptorId, definition } = bootstrapResult;

      setStatus('opening');

      // Step 2: Open the insurer's page in discovery mode
      const discoveryResult = await chrome.runtime.sendMessage({
        type: 'START_DISCOVERY_TAB',
        adaptorId,
        adaptorName: provider.trim(),
        startUrl: definition?.startUrl || startUrl.trim(),
      });

      if (!discoveryResult?.success) {
        throw new Error(discoveryResult?.error || 'Failed to open discovery tab');
      }

      onDiscoveryStarted(adaptorId);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-semibold text-slate-800">
          Add New Insurer
        </h2>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed">
        Add any insurer not yet supported. Just provide the URL to their
        quote form and we'll guide you through recording the flow. Your
        navigation helps build the adaptor for everyone.
      </p>

      <div className="flex flex-col gap-3">
        <Input
          label="Insurer Name"
          placeholder="e.g. Suncorp, Real Insurance, Bingle"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={status !== 'idle'}
        />

        <Select
          label="Product Type"
          value={productType}
          onChange={(e) => setProductType(e.target.value as ProductType)}
          disabled={status !== 'idle'}
        >
          {PRODUCT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <Input
          label="Quote Form URL"
          placeholder="https://www.insurer.com.au/get-a-quote"
          value={startUrl}
          onChange={(e) => setStartUrl(e.target.value)}
          disabled={status !== 'idle'}
        />

        {startUrl && !isValidUrl(startUrl) && (
          <p className="text-xs text-red-500">
            Please enter a valid URL starting with http:// or https://
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-purple-50 p-3">
        <p className="text-xs text-purple-700 leading-relaxed">
          <strong>How it works:</strong> We'll open the insurer's form and
          you fill it out as normal. The plugin records the page structure
          (fields, buttons, URLs) — never your personal data. When done,
          this recording helps future users get through the form automatically.
        </p>
      </div>

      <Button
        onClick={handleStartDiscovery}
        disabled={!isValid || status !== 'idle'}
        className="w-full"
      >
        {status === 'creating'
          ? 'Creating adaptor...'
          : status === 'opening'
            ? 'Opening insurer page...'
            : 'Start Discovery'}
      </Button>

      {status === 'error' && (
        <Button
          variant="secondary"
          onClick={() => {
            setStatus('idle');
            setError('');
          }}
          className="w-full"
        >
          Try Again
        </Button>
      )}
    </div>
  );
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

import React, { useState } from 'react';
import { Button } from '../shared/ui/Button';
import { Input } from '../shared/ui/Input';

interface Props {
  onComplete: () => void;
  onUnlock: (passphrase: string) => void;
}

export function Onboarding({ onComplete, onUnlock }: Props) {
  const [step, setStep] = useState<'intro' | 'passphrase'>('intro');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState('');

  function handleSetPassphrase() {
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }
    onUnlock(passphrase);
    onComplete();
  }

  if (step === 'intro') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Welcome to Quote Compare
        </h2>
        <p className="text-sm text-gray-600">
          Compare insurance quotes from Australian providers without the hassle of
          filling out the same forms over and over.
        </p>

        <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-2">
          <h3 className="font-semibold text-blue-900">How it works</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Fill in your details once in a secure local profile</li>
            <li>Select which insurers to compare</li>
            <li>The extension fills out each insurer's form for you</li>
            <li>Compare all your quotes side by side</li>
          </ol>
        </div>

        <div className="bg-green-50 rounded-lg p-3 text-sm space-y-2">
          <h3 className="font-semibold text-green-900">Your privacy</h3>
          <ul className="list-disc list-inside space-y-1 text-green-800">
            <li>All data is encrypted and stored on your device only</li>
            <li>Nothing is ever sent to our servers</li>
            <li>Your browser makes all requests directly to insurers</li>
            <li>You can delete all data at any time</li>
          </ul>
        </div>

        <Button onClick={() => setStep('passphrase')} className="w-full">
          Get Started
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Secure Your Data</h2>
      <p className="text-sm text-gray-600">
        Choose a passphrase to encrypt your personal details. You'll need this
        each time you open the extension.
      </p>

      <Input
        label="Passphrase"
        type="password"
        value={passphrase}
        onChange={(e) => {
          setPassphrase(e.target.value);
          setError('');
        }}
        placeholder="At least 8 characters"
      />

      <Input
        label="Confirm Passphrase"
        type="password"
        value={confirmPassphrase}
        onChange={(e) => {
          setConfirmPassphrase(e.target.value);
          setError('');
        }}
        error={error}
      />

      <Button onClick={handleSetPassphrase} className="w-full">
        Create Encrypted Profile
      </Button>
    </div>
  );
}

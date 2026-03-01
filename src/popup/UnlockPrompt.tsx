import React, { useState } from 'react';
import { Button } from '../shared/ui/Button';
import { Input } from '../shared/ui/Input';

interface Props {
  onUnlock: (passphrase: string) => Promise<void>;
}

export function UnlockPrompt({ onUnlock }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase) {
      setError('Please enter your passphrase');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onUnlock(passphrase);
    } catch {
      setError('Incorrect passphrase. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Unlock Your Profile</h2>
      <p className="text-sm text-gray-600">
        Enter your passphrase to access your encrypted profile data.
      </p>
      <Input
        label="Passphrase"
        type="password"
        value={passphrase}
        onChange={(e) => {
          setPassphrase(e.target.value);
          setError('');
        }}
        placeholder="Enter your passphrase"
        error={error}
      />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Unlocking...' : 'Unlock'}
      </Button>
    </form>
  );
}

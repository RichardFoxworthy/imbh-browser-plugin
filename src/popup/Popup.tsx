import React, { useState, useEffect } from 'react';
import { ProfileForm } from '../profile/ProfileForm';
import { ProviderSelector } from './ProviderSelector';
import { QuoteProgress } from './QuoteProgress';
import { Settings } from './Settings';
import { Onboarding } from './Onboarding';
import { UnlockPrompt } from './UnlockPrompt';
import { profileStore } from '../storage/profile-store';
import type { UserProfile } from '../profile/types';

type View = 'onboarding' | 'unlock' | 'profile' | 'providers' | 'quoting' | 'settings';

export function Popup() {
  const [view, setView] = useState<View>('onboarding');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);

  useEffect(() => {
    checkExistingProfile();
  }, []);

  async function checkExistingProfile() {
    const hasProfile = await profileStore.hasProfile();
    if (hasProfile) {
      setView('unlock');
    } else {
      setView('onboarding');
    }
  }

  function navigateTo(target: View) {
    if (!profileStore.isUnlocked() && (target === 'profile' || target === 'providers' || target === 'quoting')) {
      setPendingView(target);
      setView('unlock');
    } else {
      setView(target);
    }
  }

  async function handleUnlock(passphrase: string) {
    try {
      await profileStore.unlock(passphrase);
      const loaded = await profileStore.loadProfile();
      setProfile(loaded);
      setIsUnlocked(true);
      const next = pendingView || (loaded ? 'providers' : 'profile');
      setPendingView(null);
      setView(next);
    } catch {
      // No existing profile — initialise the store with this passphrase for first save
      await profileStore.initWithPassphrase(passphrase);
      setIsUnlocked(true);
      const next = pendingView || 'profile';
      setPendingView(null);
      setView(next);
    }
  }

  async function handleProfileSave(newProfile: UserProfile) {
    if (!profileStore.isUnlocked()) {
      setPendingView('profile');
      setView('unlock');
      return;
    }
    try {
      await profileStore.saveProfile(newProfile);
      setProfile(newProfile);
      setView('providers');
    } catch (err) {
      console.error('Failed to save profile:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to save profile: ${msg}`);
    }
  }

  function handleStartQuoting() {
    setView('quoting');
  }

  return (
    <div className="w-[400px] min-h-[500px] bg-white text-gray-900">
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Quote Compare</h1>
        <nav className="flex gap-2">
          {view !== 'onboarding' && view !== 'unlock' && (
            <>
              <button
                onClick={() => navigateTo('profile')}
                className="text-sm px-2 py-1 rounded hover:bg-blue-500"
              >
                Profile
              </button>
              <button
                onClick={() => navigateTo('providers')}
                className="text-sm px-2 py-1 rounded hover:bg-blue-500"
              >
                Quote
              </button>
              <button
                onClick={() => setView('settings')}
                className="text-sm px-2 py-1 rounded hover:bg-blue-500"
              >
                Settings
              </button>
            </>
          )}
        </nav>
      </header>

      <main className="p-4">
        {view === 'onboarding' && (
          <Onboarding
            onComplete={() => setView('profile')}
            onUnlock={handleUnlock}
          />
        )}
        {view === 'unlock' && (
          <UnlockPrompt onUnlock={handleUnlock} />
        )}
        {view === 'profile' && (
          <ProfileForm
            existingProfile={profile}
            onSave={handleProfileSave}
          />
        )}
        {view === 'providers' && (
          <ProviderSelector
            profile={profile}
            onStartQuoting={handleStartQuoting}
          />
        )}
        {view === 'quoting' && (
          <QuoteProgress
            onComplete={() => {
              // Open side panel for comparison
              (chrome.sidePanel as any)?.open?.({});
            }}
          />
        )}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}

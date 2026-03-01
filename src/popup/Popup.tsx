import React, { useState, useEffect } from 'react';
import { ProfileForm } from '../profile/ProfileForm';
import { ProviderSelector } from './ProviderSelector';
import { QuoteProgress } from './QuoteProgress';
import { Settings } from './Settings';
import { Onboarding } from './Onboarding';
import { profileStore } from '../storage/profile-store';
import type { UserProfile } from '../profile/types';

type View = 'onboarding' | 'profile' | 'providers' | 'quoting' | 'settings';

export function Popup() {
  const [view, setView] = useState<View>('onboarding');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    checkExistingProfile();
  }, []);

  async function checkExistingProfile() {
    const hasProfile = await profileStore.hasProfile();
    if (hasProfile) {
      setView('providers');
    } else {
      setView('onboarding');
    }
  }

  async function handleUnlock(passphrase: string) {
    try {
      await profileStore.unlock(passphrase);
      const loaded = await profileStore.loadProfile();
      if (loaded) {
        setProfile(loaded);
        setIsUnlocked(true);
        setView('providers');
      } else {
        setIsUnlocked(true);
        setView('profile');
      }
    } catch {
      // No existing profile — initialise the store with this passphrase for first save
      await profileStore.initWithPassphrase(passphrase);
      setIsUnlocked(true);
      setView('profile');
    }
  }

  async function handleProfileSave(newProfile: UserProfile) {
    try {
      await profileStore.saveProfile(newProfile);
      setProfile(newProfile);
      setView('providers');
    } catch (err) {
      console.error('Failed to save profile:', err);
      alert('Failed to save profile. Please try again.');
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
          {view !== 'onboarding' && (
            <>
              <button
                onClick={() => setView('profile')}
                className="text-sm px-2 py-1 rounded hover:bg-blue-500"
              >
                Profile
              </button>
              <button
                onClick={() => setView('providers')}
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

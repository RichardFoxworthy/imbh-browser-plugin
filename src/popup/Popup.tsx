import React, { useState, useEffect } from 'react';
import { ProfileForm } from '../profile/ProfileForm';
import { ProviderSelector } from './ProviderSelector';
import { QuoteProgress } from './QuoteProgress';
import { Settings } from './Settings';
import { Onboarding } from './Onboarding';
import { AddInsurer } from './AddInsurer';
import { profileStore } from '../storage/profile-store';
import type { UserProfile } from '../profile/types';

type View = 'onboarding' | 'profile' | 'providers' | 'quoting' | 'settings' | 'add-insurer' | 'discovery-active';

export function Popup() {
  const [view, setView] = useState<View>('onboarding');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [discoveryAdaptorId, setDiscoveryAdaptorId] = useState<string | null>(null);

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
      // Wrong passphrase or no profile
      setView('profile');
    }
  }

  async function handleProfileSave(newProfile: UserProfile) {
    setProfile(newProfile);
    await profileStore.saveProfile(newProfile);
    setView('providers');
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
            onAddInsurer={() => setView('add-insurer')}
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
        {view === 'add-insurer' && (
          <AddInsurer
            onBack={() => setView('providers')}
            onDiscoveryStarted={(adaptorId) => {
              setDiscoveryAdaptorId(adaptorId);
              setView('discovery-active');
            }}
          />
        )}
        {view === 'discovery-active' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-purple-600">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="12" r="4" fill="currentColor"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800">Discovery in Progress</h3>
            <p className="text-sm text-slate-600 px-4">
              Fill out the insurer's form in the open tab. The discovery overlay will
              guide you. When you're done, the adaptor will be built automatically.
            </p>
            <button
              onClick={() => setView('providers')}
              className="text-sm text-purple-600 hover:text-purple-800 underline"
            >
              Back to providers
            </button>
          </div>
        )}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}

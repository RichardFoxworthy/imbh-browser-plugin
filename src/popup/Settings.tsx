import React, { useState } from 'react';
import { Button } from '../shared/ui/Button';
import { Select } from '../shared/ui/Select';
import { Checkbox } from '../shared/ui/Checkbox';
import { profileStore } from '../storage/profile-store';
import { clearAllQuotes } from '../quoting/quote-store';

export function Settings() {
  const [automationSpeed, setAutomationSpeed] = useState('normal');
  const [respectRobotsTxt, setRespectRobotsTxt] = useState(true);
  const [useVisibleTabs, setUseVisibleTabs] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  async function handleDeleteAllData() {
    await profileStore.deleteProfile();
    await clearAllQuotes();
    setShowConfirmDelete(false);
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-900">Settings</h2>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Automation</h3>

        <Select
          label="Speed"
          value={automationSpeed}
          options={[
            { value: 'cautious', label: 'Cautious (slower, less likely to trigger detection)' },
            { value: 'normal', label: 'Normal (balanced)' },
            { value: 'fast', label: 'Fast (quicker, higher detection risk)' },
          ]}
          onChange={(e) => setAutomationSpeed(e.target.value)}
        />

        <Checkbox
          label="Use visible tabs (you can watch the automation)"
          checked={useVisibleTabs}
          onChange={(e) => setUseVisibleTabs(e.target.checked)}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Compliance</h3>

        <Checkbox
          label="Respect robots.txt directives"
          checked={respectRobotsTxt}
          onChange={(e) => setRespectRobotsTxt(e.target.checked)}
        />

        <p className="text-xs text-gray-400">
          Browser extensions aren't technically bound by robots.txt, but honouring it
          demonstrates good faith and reduces the chance of being blocked.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Data & Privacy</h3>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <div>All profile data is encrypted with AES-256-GCM</div>
          <div>Data is stored in your browser's IndexedDB</div>
          <div>Nothing is transmitted to any external server</div>
        </div>

        {!showConfirmDelete ? (
          <Button
            variant="outline"
            onClick={() => setShowConfirmDelete(true)}
            className="w-full text-red-600 border-red-300 hover:bg-red-50"
          >
            Delete All Data
          </Button>
        ) : (
          <div className="bg-red-50 rounded-lg p-3 space-y-2">
            <p className="text-sm text-red-700">
              This will permanently delete your profile and all saved quotes.
              This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteAllData}
                className="bg-red-600 hover:bg-red-700"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

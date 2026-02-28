import React, { useState } from 'react';
import { Stepper } from '../shared/ui/Stepper';
import { Button } from '../shared/ui/Button';
import { PersonalDetailsForm } from './PersonalDetailsForm';
import { HomeContentsForm } from './HomeContentsForm';
import { MotorForm } from './MotorForm';
import {
  createEmptyProfile,
  createEmptyHomeProfile,
  createEmptyMotorProfile,
} from './types';
import type { UserProfile } from './types';

interface Props {
  existingProfile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
}

const STEPS = ['Personal', 'Home', 'Motor', 'Review'];

export function ProfileForm({ existingProfile, onSave }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState<UserProfile>(
    existingProfile || createEmptyProfile()
  );
  const [includeHome, setIncludeHome] = useState(!!existingProfile?.home);
  const [includeMotor, setIncludeMotor] = useState(
    !!existingProfile?.motor && existingProfile.motor.length > 0
  );

  function handleNext() {
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  function handleSave() {
    const updated = {
      ...profile,
      updatedAt: new Date().toISOString(),
      home: includeHome ? profile.home : undefined,
      motor: includeMotor ? profile.motor : undefined,
    };
    onSave(updated);
  }

  return (
    <div>
      <Stepper steps={STEPS} currentStep={currentStep} />

      <div className="min-h-[350px]">
        {currentStep === 0 && (
          <PersonalDetailsForm
            data={profile.personal}
            onChange={(personal) => setProfile({ ...profile, personal })}
          />
        )}

        {currentStep === 1 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeHome}
                onChange={(e) => {
                  setIncludeHome(e.target.checked);
                  if (e.target.checked && !profile.home) {
                    setProfile({ ...profile, home: createEmptyHomeProfile() });
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">
                I want home & contents quotes
              </span>
            </label>

            {includeHome && profile.home && (
              <HomeContentsForm
                data={profile.home}
                onChange={(home) => setProfile({ ...profile, home })}
              />
            )}

            {!includeHome && (
              <p className="text-sm text-gray-500 mt-4">
                Check the box above to add home & contents insurance details.
              </p>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeMotor}
                onChange={(e) => {
                  setIncludeMotor(e.target.checked);
                  if (e.target.checked && (!profile.motor || profile.motor.length === 0)) {
                    setProfile({ ...profile, motor: [createEmptyMotorProfile()] });
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">
                I want motor insurance quotes
              </span>
            </label>

            {includeMotor && profile.motor && profile.motor.length > 0 && (
              <>
                {profile.motor.map((motor, idx) => (
                  <div key={motor.id} className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-800">
                        Vehicle {idx + 1}
                      </h3>
                      {profile.motor!.length > 1 && (
                        <button
                          onClick={() =>
                            setProfile({
                              ...profile,
                              motor: profile.motor!.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <MotorForm
                      data={motor}
                      onChange={(updated) => {
                        const motors = [...profile.motor!];
                        motors[idx] = updated;
                        setProfile({ ...profile, motor: motors });
                      }}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setProfile({
                      ...profile,
                      motor: [...(profile.motor || []), createEmptyMotorProfile()],
                    })
                  }
                >
                  + Add Another Vehicle
                </Button>
              </>
            )}

            {!includeMotor && (
              <p className="text-sm text-gray-500 mt-4">
                Check the box above to add motor insurance details.
              </p>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Review Your Profile</h2>

            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
              <div>
                <span className="font-medium">Name:</span>{' '}
                {profile.personal.firstName} {profile.personal.lastName}
              </div>
              <div>
                <span className="font-medium">DOB:</span> {profile.personal.dateOfBirth}
              </div>
              <div>
                <span className="font-medium">Address:</span>{' '}
                {[
                  profile.personal.currentAddress.unit,
                  profile.personal.currentAddress.streetNumber,
                  profile.personal.currentAddress.streetName,
                  profile.personal.currentAddress.suburb,
                  profile.personal.currentAddress.state,
                  profile.personal.currentAddress.postcode,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </div>
            </div>

            {includeHome && profile.home && (
              <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
                <h3 className="font-semibold text-blue-900">Home & Contents</h3>
                <div>
                  {profile.home.propertyType} &middot; {profile.home.constructionType} &middot;{' '}
                  {profile.home.coverType}
                </div>
                <div>
                  Building: ${profile.home.buildingSumInsured.toLocaleString()} &middot;
                  Contents: ${profile.home.contentsSumInsured.toLocaleString()}
                </div>
                <div>Excess: ${profile.home.excessPreference}</div>
              </div>
            )}

            {includeMotor && profile.motor && profile.motor.length > 0 && (
              <div className="bg-green-50 rounded-lg p-3 text-sm space-y-2">
                <h3 className="font-semibold text-green-900">Motor Insurance</h3>
                {profile.motor.map((m, i) => (
                  <div key={m.id}>
                    <div className="font-medium">
                      Vehicle {i + 1}: {m.vehicle.year} {m.vehicle.make} {m.vehicle.model}
                    </div>
                    <div>
                      {m.coverType} &middot; {m.parkingLocation} &middot; Excess: $
                      {m.excessPreference}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!includeHome && !includeMotor && (
              <p className="text-sm text-amber-600">
                You haven't selected any insurance types. Go back to add home or motor details.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t mt-4">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          Back
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button onClick={handleNext}>Next</Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={!includeHome && !includeMotor}
          >
            Save Profile
          </Button>
        )}
      </div>
    </div>
  );
}

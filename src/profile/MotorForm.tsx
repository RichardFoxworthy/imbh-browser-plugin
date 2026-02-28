import React from 'react';
import { Input } from '../shared/ui/Input';
import { Select } from '../shared/ui/Select';
import { Checkbox } from '../shared/ui/Checkbox';
import {
  AUSTRALIAN_STATES,
  MOTOR_COVER_TYPES,
  PARKING_LOCATIONS,
  DAILY_KILOMETRES,
  FUEL_TYPES,
} from '../shared/constants';
import type { MotorProfile, VehicleDetails } from './types';

interface Props {
  data: MotorProfile;
  onChange: (data: MotorProfile) => void;
}

export function MotorForm({ data, onChange }: Props) {
  function update<K extends keyof MotorProfile>(key: K, value: MotorProfile[K]) {
    onChange({ ...data, [key]: value });
  }

  function updateVehicle<K extends keyof VehicleDetails>(key: K, value: VehicleDetails[K]) {
    onChange({ ...data, vehicle: { ...data.vehicle, [key]: value } });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Motor Insurance</h2>

      <Select
        label="Cover Type"
        value={data.coverType}
        options={MOTOR_COVER_TYPES}
        onChange={(e) => update('coverType', e.target.value as any)}
      />

      <h3 className="text-sm font-semibold text-gray-800">Vehicle Details</h3>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Make"
          value={data.vehicle.make}
          onChange={(e) => updateVehicle('make', e.target.value)}
          placeholder="e.g. Toyota"
          required
        />
        <Input
          label="Model"
          value={data.vehicle.model}
          onChange={(e) => updateVehicle('model', e.target.value)}
          placeholder="e.g. Corolla"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Year"
          type="number"
          min={1950}
          max={new Date().getFullYear() + 1}
          value={data.vehicle.year}
          onChange={(e) => updateVehicle('year', parseInt(e.target.value) || 2020)}
        />
        <Input
          label="Body Type"
          value={data.vehicle.bodyType}
          onChange={(e) => updateVehicle('bodyType', e.target.value)}
          placeholder="e.g. Sedan"
        />
        <Select
          label="Transmission"
          value={data.vehicle.transmission}
          options={[
            { value: 'automatic', label: 'Automatic' },
            { value: 'manual', label: 'Manual' },
          ]}
          onChange={(e) => updateVehicle('transmission', e.target.value as any)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Fuel Type"
          value={data.vehicle.fuelType}
          options={FUEL_TYPES}
          onChange={(e) => updateVehicle('fuelType', e.target.value as any)}
        />
        <Input
          label="Engine Size"
          value={data.vehicle.engineSize}
          onChange={(e) => updateVehicle('engineSize', e.target.value)}
          placeholder="e.g. 1.8L"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Colour"
          value={data.vehicle.colour}
          onChange={(e) => updateVehicle('colour', e.target.value)}
        />
        <Input
          label="Registration"
          value={data.vehicle.registration}
          onChange={(e) => updateVehicle('registration', e.target.value)}
          placeholder="e.g. ABC123"
        />
      </div>

      <Select
        label="Registration State"
        value={data.vehicle.registrationState}
        options={AUSTRALIAN_STATES}
        onChange={(e) => updateVehicle('registrationState', e.target.value as any)}
      />

      <h3 className="text-sm font-semibold text-gray-800">Usage & Parking</h3>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Parking Location"
          value={data.parkingLocation}
          options={PARKING_LOCATIONS}
          onChange={(e) => update('parkingLocation', e.target.value as any)}
        />
        <Select
          label="Annual Kilometres"
          value={data.dailyKilometres}
          options={DAILY_KILOMETRES}
          onChange={(e) => update('dailyKilometres', e.target.value as any)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Checkbox
          label="Business Use"
          checked={data.businessUse}
          onChange={(e) => update('businessUse', e.target.checked)}
        />
        <Checkbox
          label="Finance Owing"
          checked={data.financeOwing}
          onChange={(e) => update('financeOwing', e.target.checked)}
        />
      </div>

      <h3 className="text-sm font-semibold text-gray-800">Cover Details</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Checkbox
            label="Market Value"
            checked={data.marketValue}
            onChange={(e) => update('marketValue', e.target.checked)}
          />
          {!data.marketValue && (
            <Input
              label="Agreed Value ($)"
              type="number"
              min={0}
              step={1000}
              value={data.agreedValue || 0}
              onChange={(e) => update('agreedValue', parseInt(e.target.value) || 0)}
              className="mt-2"
            />
          )}
        </div>
        <Input
          label="Preferred Excess ($)"
          type="number"
          min={0}
          step={100}
          value={data.excessPreference}
          onChange={(e) => update('excessPreference', parseInt(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}

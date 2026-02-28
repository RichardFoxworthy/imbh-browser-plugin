import React from 'react';
import { Input } from '../shared/ui/Input';
import { Select } from '../shared/ui/Select';
import { AUSTRALIAN_STATES } from '../shared/constants';
import type { PersonalDetails, Address } from './types';

interface Props {
  data: PersonalDetails;
  onChange: (data: PersonalDetails) => void;
}

export function PersonalDetailsForm({ data, onChange }: Props) {
  function updateField<K extends keyof PersonalDetails>(key: K, value: PersonalDetails[K]) {
    onChange({ ...data, [key]: value });
  }

  function updateAddress<K extends keyof Address>(key: K, value: Address[K]) {
    onChange({
      ...data,
      currentAddress: { ...data.currentAddress, [key]: value },
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Personal Details</h2>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First Name"
          value={data.firstName}
          onChange={(e) => updateField('firstName', e.target.value)}
          required
        />
        <Input
          label="Last Name"
          value={data.lastName}
          onChange={(e) => updateField('lastName', e.target.value)}
          required
        />
      </div>

      <Input
        label="Date of Birth"
        type="date"
        value={data.dateOfBirth}
        onChange={(e) => updateField('dateOfBirth', e.target.value)}
        required
      />

      <Input
        label="Email"
        type="email"
        value={data.email}
        onChange={(e) => updateField('email', e.target.value)}
        required
      />

      <Input
        label="Phone"
        type="tel"
        value={data.phone}
        onChange={(e) => updateField('phone', e.target.value)}
        placeholder="04XX XXX XXX"
        required
      />

      <h3 className="text-sm font-semibold text-gray-800 pt-2">Current Address</h3>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Unit"
          value={data.currentAddress.unit || ''}
          onChange={(e) => updateAddress('unit', e.target.value)}
          placeholder="Optional"
        />
        <Input
          label="Street No."
          value={data.currentAddress.streetNumber}
          onChange={(e) => updateAddress('streetNumber', e.target.value)}
          required
        />
        <Input
          label="Street Name"
          value={data.currentAddress.streetName}
          onChange={(e) => updateAddress('streetName', e.target.value)}
          required
          className="col-span-1"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Suburb"
          value={data.currentAddress.suburb}
          onChange={(e) => updateAddress('suburb', e.target.value)}
          required
        />
        <Select
          label="State"
          value={data.currentAddress.state}
          options={AUSTRALIAN_STATES}
          onChange={(e) => updateAddress('state', e.target.value as any)}
        />
        <Input
          label="Postcode"
          value={data.currentAddress.postcode}
          onChange={(e) => updateAddress('postcode', e.target.value)}
          maxLength={4}
          required
        />
      </div>

      <Input
        label="Years at Address"
        type="number"
        min={0}
        value={data.currentAddress.yearsAtAddress}
        onChange={(e) => updateAddress('yearsAtAddress', parseInt(e.target.value) || 0)}
      />
    </div>
  );
}

import React from 'react';
import { Input } from '../shared/ui/Input';
import { Select } from '../shared/ui/Select';
import { Checkbox } from '../shared/ui/Checkbox';
import {
  PROPERTY_TYPES,
  OWNERSHIP_STATUSES,
  CONSTRUCTION_TYPES,
  ROOF_TYPES,
  COVER_TYPES,
} from '../shared/constants';
import type { HomeContentsProfile } from './types';

interface Props {
  data: HomeContentsProfile;
  onChange: (data: HomeContentsProfile) => void;
}

export function HomeContentsForm({ data, onChange }: Props) {
  function update<K extends keyof HomeContentsProfile>(key: K, value: HomeContentsProfile[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Home & Contents</h2>

      <Select
        label="Cover Type"
        value={data.coverType}
        options={COVER_TYPES}
        onChange={(e) => update('coverType', e.target.value as any)}
      />

      <h3 className="text-sm font-semibold text-gray-800">Property Details</h3>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Property Type"
          value={data.propertyType}
          options={PROPERTY_TYPES}
          onChange={(e) => update('propertyType', e.target.value as any)}
        />
        <Select
          label="Ownership"
          value={data.ownershipStatus}
          options={OWNERSHIP_STATUSES}
          onChange={(e) => update('ownershipStatus', e.target.value as any)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Construction"
          value={data.constructionType}
          options={CONSTRUCTION_TYPES}
          onChange={(e) => update('constructionType', e.target.value as any)}
        />
        <Select
          label="Roof Type"
          value={data.roofType}
          options={ROOF_TYPES}
          onChange={(e) => update('roofType', e.target.value as any)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Year Built"
          type="number"
          min={1800}
          max={new Date().getFullYear()}
          value={data.yearBuilt}
          onChange={(e) => update('yearBuilt', parseInt(e.target.value) || 2000)}
        />
        <Input
          label="Bedrooms"
          type="number"
          min={1}
          max={20}
          value={data.numberOfBedrooms}
          onChange={(e) => update('numberOfBedrooms', parseInt(e.target.value) || 1)}
        />
        <Input
          label="Bathrooms"
          type="number"
          min={1}
          max={10}
          value={data.numberOfBathrooms}
          onChange={(e) => update('numberOfBathrooms', parseInt(e.target.value) || 1)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Storeys"
          type="number"
          min={1}
          max={5}
          value={data.numberOfStoreys}
          onChange={(e) => update('numberOfStoreys', parseInt(e.target.value) || 1)}
        />
        <Input
          label="Land Area (sqm)"
          type="number"
          min={0}
          value={data.landArea}
          onChange={(e) => update('landArea', parseInt(e.target.value) || 0)}
        />
      </div>

      <h3 className="text-sm font-semibold text-gray-800">Security Features</h3>

      <div className="grid grid-cols-2 gap-2">
        <Checkbox
          label="Security Alarm"
          checked={data.securityAlarm}
          onChange={(e) => update('securityAlarm', e.target.checked)}
        />
        <Checkbox
          label="Security Cameras"
          checked={data.securityCameras}
          onChange={(e) => update('securityCameras', e.target.checked)}
        />
        <Checkbox
          label="Deadlocks"
          checked={data.deadlocks}
          onChange={(e) => update('deadlocks', e.target.checked)}
        />
        <Checkbox
          label="Smoke Alarms"
          checked={data.smokeAlarms}
          onChange={(e) => update('smokeAlarms', e.target.checked)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Checkbox
          label="Swimming Pool"
          checked={data.swimmingPool}
          onChange={(e) => update('swimmingPool', e.target.checked)}
        />
        {data.swimmingPool && (
          <Checkbox
            label="Pool Fenced"
            checked={data.poolFenced}
            onChange={(e) => update('poolFenced', e.target.checked)}
          />
        )}
      </div>

      <h3 className="text-sm font-semibold text-gray-800">Cover Amounts</h3>

      <div className="grid grid-cols-2 gap-3">
        {data.coverType !== 'contents-only' && (
          <Input
            label="Building Sum Insured ($)"
            type="number"
            min={0}
            step={10000}
            value={data.buildingSumInsured}
            onChange={(e) => update('buildingSumInsured', parseInt(e.target.value) || 0)}
          />
        )}
        {data.coverType !== 'home-only' && (
          <Input
            label="Contents Sum Insured ($)"
            type="number"
            min={0}
            step={5000}
            value={data.contentsSumInsured}
            onChange={(e) => update('contentsSumInsured', parseInt(e.target.value) || 0)}
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
  );
}

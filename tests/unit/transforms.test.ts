import { describe, it, expect } from 'vitest';
import { applyTransform, TransformSpec } from '../../src/adaptors/transforms';

describe('applyTransform', () => {
  describe('boolean transform', () => {
    const spec: TransformSpec = {
      type: 'boolean',
      trueValue: 'Yes',
      falseValue: 'No',
    };

    it('returns trueValue for truthy value', () => {
      expect(applyTransform(true, spec)).toBe('Yes');
      expect(applyTransform(1, spec)).toBe('Yes');
      expect(applyTransform('non-empty', spec)).toBe('Yes');
    });

    it('returns falseValue for falsy value', () => {
      expect(applyTransform(false, spec)).toBe('No');
      expect(applyTransform(0, spec)).toBe('No');
      expect(applyTransform('', spec)).toBe('No');
      expect(applyTransform(null, spec)).toBe('No');
    });
  });

  describe('format transform', () => {
    const spec: TransformSpec = {
      type: 'format',
      template: '{unit}/{streetNumber} {streetName}',
    };

    it('interpolates object properties into template', () => {
      const value = { unit: '3', streetNumber: '42', streetName: 'King St' };
      expect(applyTransform(value, spec)).toBe('3/42 King St');
    });

    it('replaces missing properties with empty string', () => {
      const value = { streetNumber: '10', streetName: 'Main Rd' };
      expect(applyTransform(value, spec)).toBe('/10 Main Rd');
    });

    it('returns string coercion for non-object value', () => {
      expect(applyTransform('hello', spec)).toBe('hello');
    });

    it('returns "null" for null value', () => {
      expect(applyTransform(null, spec)).toBe('null');
    });
  });

  describe('map transform', () => {
    const spec: TransformSpec = {
      type: 'map',
      mapping: {
        house: 'House',
        apartment: 'Flat',
        townhouse: 'Townhouse',
      },
      fallback: 'Other',
    };

    it('maps a known value', () => {
      expect(applyTransform('house', spec)).toBe('House');
      expect(applyTransform('apartment', spec)).toBe('Flat');
    });

    it('returns fallback for unknown value', () => {
      expect(applyTransform('villa', spec)).toBe('Other');
    });

    it('returns string coercion when no fallback and no match', () => {
      const noFallback: TransformSpec = {
        type: 'map',
        mapping: { a: 'A' },
      };
      expect(applyTransform('b', noFallback)).toBe('b');
    });
  });

  describe('date transform', () => {
    it('formats to DD/MM/YYYY', () => {
      const spec: TransformSpec = { type: 'date', outputFormat: 'DD/MM/YYYY' };
      // Use a UTC ISO string so the result is predictable
      const result = applyTransform('1990-07-15T00:00:00.000Z', spec);
      expect(result).toMatch(/15\/07\/1990/);
    });

    it('formats to YYYY-MM-DD', () => {
      const spec: TransformSpec = { type: 'date', outputFormat: 'YYYY-MM-DD' };
      const result = applyTransform('2000-12-25T00:00:00.000Z', spec);
      expect(result).toMatch(/2000-12-25/);
    });

    it('formats to MM/DD/YY', () => {
      const spec: TransformSpec = { type: 'date', outputFormat: 'MM/DD/YY' };
      const result = applyTransform('2025-03-05T00:00:00.000Z', spec);
      expect(result).toMatch(/03\/05\/25/);
    });

    it('returns raw string for invalid date', () => {
      const spec: TransformSpec = { type: 'date', outputFormat: 'DD/MM/YYYY' };
      expect(applyTransform('not-a-date', spec)).toBe('not-a-date');
    });
  });

  describe('concat transform', () => {
    const spec: TransformSpec = {
      type: 'concat',
      paths: ['a', 'b'],
      separator: ' ',
    };

    it('joins an array with the separator', () => {
      expect(applyTransform(['Jane', 'Smith'], spec)).toBe('Jane Smith');
    });

    it('filters out falsy values', () => {
      expect(applyTransform(['Jane', '', null, 'Smith'], spec)).toBe('Jane Smith');
    });

    it('returns string coercion for non-array value', () => {
      expect(applyTransform('single', spec)).toBe('single');
    });
  });

  describe('address transform', () => {
    const addr = {
      unit: '5',
      streetNumber: '12',
      streetName: 'Ocean Ave',
      suburb: 'Bondi',
      state: 'NSW',
      postcode: '2026',
    };

    it('formats full address', () => {
      const spec: TransformSpec = { type: 'address', format: 'full' };
      expect(applyTransform(addr, spec)).toBe('5/12 Ocean Ave, Bondi NSW 2026');
    });

    it('formats street only', () => {
      const spec: TransformSpec = { type: 'address', format: 'street' };
      expect(applyTransform(addr, spec)).toBe('5/12 Ocean Ave');
    });

    it('formats suburb-state-postcode', () => {
      const spec: TransformSpec = { type: 'address', format: 'suburb-state-postcode' };
      expect(applyTransform(addr, spec)).toBe('Bondi NSW 2026');
    });

    it('omits unit prefix when unit is missing', () => {
      const noUnit = { ...addr, unit: undefined };
      const spec: TransformSpec = { type: 'address', format: 'street' };
      expect(applyTransform(noUnit, spec)).toBe('12 Ocean Ave');
    });

    it('returns string coercion for non-object value', () => {
      const spec: TransformSpec = { type: 'address', format: 'full' };
      expect(applyTransform('123 Main St', spec)).toBe('123 Main St');
    });
  });
});

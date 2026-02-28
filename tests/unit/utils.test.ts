import { describe, it, expect } from 'vitest';
import { resolvePath, normaliseLabel, fuzzyMatch } from '../../src/shared/utils';

describe('resolvePath', () => {
  const obj = {
    personal: {
      firstName: 'Jane',
      lastName: 'Smith',
      address: {
        suburb: 'Bondi',
        postcode: '2026',
      },
    },
    motor: {
      make: 'Toyota',
    },
  };

  it('resolves a top-level key', () => {
    expect(resolvePath(obj, 'motor')).toEqual({ make: 'Toyota' });
  });

  it('resolves a nested path', () => {
    expect(resolvePath(obj, 'personal.firstName')).toBe('Jane');
  });

  it('resolves a deeply nested path', () => {
    expect(resolvePath(obj, 'personal.address.postcode')).toBe('2026');
  });

  it('returns undefined for a missing path', () => {
    expect(resolvePath(obj, 'personal.email')).toBeUndefined();
  });

  it('resolves JS properties on primitives (e.g. string.length)', () => {
    // 'Jane'.length === 4 — resolvePath uses optional chaining, so this works
    expect(resolvePath(obj, 'personal.firstName.length')).toBe(4);
  });

  it('handles an empty path segment gracefully', () => {
    // edge case: leading dot
    expect(resolvePath(obj, '.personal')).toBeUndefined();
  });
});

describe('normaliseLabel', () => {
  it('lowercases text', () => {
    expect(normaliseLabel('First Name')).toBe('first name');
  });

  it('strips punctuation', () => {
    expect(normaliseLabel("What's your date-of-birth?")).toBe('whats your dateofbirth');
  });

  it('collapses multiple spaces', () => {
    expect(normaliseLabel('  street   number  ')).toBe('street number');
  });

  it('returns empty string for empty input', () => {
    expect(normaliseLabel('')).toBe('');
  });

  it('preserves digits', () => {
    expect(normaliseLabel('Unit 3/42')).toBe('unit 342');
  });
});

describe('fuzzyMatch', () => {
  it('matches when all needle words appear in haystack', () => {
    expect(fuzzyMatch('What is your First Name?', 'first name')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('Date of Birth', 'DATE BIRTH')).toBe(true);
  });

  it('fails when a needle word is missing', () => {
    expect(fuzzyMatch('Street Address', 'suburb')).toBe(false);
  });

  it('matches single-word needle', () => {
    expect(fuzzyMatch('Email Address', 'email')).toBe(true);
  });

  it('handles punctuation in both sides', () => {
    expect(fuzzyMatch("What's your postcode?", 'postcode')).toBe(true);
  });

  it('returns true for empty needle (all zero words match)', () => {
    // every([]) === true
    expect(fuzzyMatch('anything', '')).toBe(true);
  });
});

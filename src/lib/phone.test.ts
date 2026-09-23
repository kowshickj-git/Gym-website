import { describe, expect, it } from 'vitest';
import { formatPhone, isValidPhone, maskPhone, normalisePhone } from './phone';

/**
 * The phone number is the member's login identity and the uniqueness key, so
 * every spelling of the same number has to normalise to the same string — one
 * member typing "0 98765 43210" must not create a second account.
 */
describe('normalisePhone', () => {
  it('accepts a bare ten-digit Indian mobile', () => {
    expect(normalisePhone('9876543210')).toBe('+919876543210');
  });

  it('ignores spaces, dashes and brackets', () => {
    for (const input of ['98765 43210', '98765-43210', '(98765) 43210', ' 9876543210 ']) {
      expect(normalisePhone(input)).toBe('+919876543210');
    }
  });

  it('strips the trunk prefix', () => {
    expect(normalisePhone('09876543210')).toBe('+919876543210');
  });

  it('accepts the country code in every common spelling', () => {
    for (const input of ['+919876543210', '919876543210', '+91 98765 43210', '0091 9876543210']) {
      expect(normalisePhone(input)).toBe('+919876543210');
    }
  });

  it('rejects numbers that are not Indian mobiles', () => {
    expect(normalisePhone('1234567890')).toBeNull(); // does not start 6-9
    expect(normalisePhone('987654321')).toBeNull(); // too short
    expect(normalisePhone('98765432101')).toBeNull(); // too long
    expect(normalisePhone('0442345678')).toBeNull(); // landline
  });

  it('rejects empty and junk input', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone('not a number')).toBeNull();
  });

  it('keeps an explicitly international number for the occasional overseas member', () => {
    expect(normalisePhone('+14155552671')).toBe('+14155552671');
    expect(normalisePhone('+971501234567')).toBe('+971501234567');
  });

  it('is idempotent', () => {
    const once = normalisePhone('98765 43210')!;
    expect(normalisePhone(once)).toBe(once);
  });
});

describe('isValidPhone', () => {
  it('agrees with normalisePhone', () => {
    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
  });
});

describe('display helpers', () => {
  it('groups an Indian number for reading aloud', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
  });

  it('leaves an unrecognised format alone rather than mangling it', () => {
    expect(formatPhone('+14155552671')).toBe('+14155552671');
    expect(formatPhone(null)).toBe('—');
  });

  it('masks everything but the last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('••••••3210');
    expect(maskPhone(null)).toBe('');
  });
});

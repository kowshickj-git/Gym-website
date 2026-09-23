import { describe, expect, it } from 'vitest';
import {
  buildUpiLink,
  isValidVpa,
  normaliseUpiReference,
  upiAppLinks,
  upiTransactionRef,
  UpiConfigError,
} from './upi';

const PAYMENT_ID = '3f1b9c2a-5d4e-4a7b-8c9d-0e1f2a3b4c5d';

describe('isValidVpa', () => {
  it('accepts the handles Indian banks actually issue', () => {
    for (const vpa of ['ironcore@okaxis', 'gym.name@ybl', 'gym-1@paytm', 'abc_123@oksbi', '9876543210@upi']) {
      expect(isValidVpa(vpa)).toBe(true);
    }
  });

  it('rejects malformed ids', () => {
    for (const vpa of ['ironcore', '@okaxis', 'ironcore@', 'a@b', 'gym name@okaxis', 'gym@@okaxis', '']) {
      expect(isValidVpa(vpa)).toBe(false);
    }
  });

  it('rejects nullish input', () => {
    expect(isValidVpa(null)).toBe(false);
    expect(isValidVpa(undefined)).toBe(false);
  });
});

describe('upiTransactionRef', () => {
  it('strips the hyphens a UUID carries, since UPI allows alphanumerics only', () => {
    const ref = upiTransactionRef(PAYMENT_ID);
    expect(ref).toMatch(/^[A-Z0-9]+$/);
    expect(ref.startsWith('ICF')).toBe(true);
  });

  it('stays within the 35-character limit UPI imposes', () => {
    expect(upiTransactionRef(PAYMENT_ID).length).toBeLessThanOrEqual(35);
    expect(upiTransactionRef(PAYMENT_ID, 'VERYLONGPREFIX').length).toBeLessThanOrEqual(35);
  });
});

describe('buildUpiLink', () => {
  const base = {
    vpa: 'ironcore@okaxis',
    payeeName: 'Iron Core Fitness',
    amount: 5800,
    transactionRef: 'ICF123ABC',
  };

  it('produces a link every UPI app understands', () => {
    const link = buildUpiLink(base);
    expect(link.startsWith('upi://pay?')).toBe(true);

    const params = new URLSearchParams(link.slice(link.indexOf('?') + 1));
    expect(params.get('pa')).toBe('ironcore@okaxis');
    expect(params.get('pn')).toBe('Iron Core Fitness');
    expect(params.get('am')).toBe('5800.00');
    expect(params.get('cu')).toBe('INR');
    expect(params.get('tr')).toBe('ICF123ABC');
  });

  it('always sends two decimal places, so the app locks the amount', () => {
    expect(new URLSearchParams(buildUpiLink({ ...base, amount: 800 }).split('?')[1]).get('am')).toBe('800.00');
    expect(new URLSearchParams(buildUpiLink({ ...base, amount: 2999.5 }).split('?')[1]).get('am')).toBe('2999.50');
    expect(new URLSearchParams(buildUpiLink({ ...base, amount: 699.93 }).split('?')[1]).get('am')).toBe('699.93');
  });

  it('encodes spaces as %20 rather than +, which UPI apps mis-parse', () => {
    const link = buildUpiLink(base);
    expect(link).toContain('Iron%20Core%20Fitness');
    expect(link).not.toContain('+');
  });

  it('cleans the note down to what apps display', () => {
    const link = buildUpiLink({ ...base, note: 'Membership: 6 Months (Cardio + Weights)!' });
    const note = new URLSearchParams(link.slice(link.indexOf('?') + 1)).get('tn')!;
    expect(note).toBe('Membership 6 Months Cardio Weights');
    expect(note.length).toBeLessThanOrEqual(50);
  });

  it('omits the note when there is none', () => {
    expect(buildUpiLink(base)).not.toContain('tn=');
  });

  it('refuses an invalid payee id rather than producing a dead link', () => {
    expect(() => buildUpiLink({ ...base, vpa: 'not-a-vpa' })).toThrow(UpiConfigError);
  });

  it('refuses a zero or negative amount', () => {
    expect(() => buildUpiLink({ ...base, amount: 0 })).toThrow(UpiConfigError);
    expect(() => buildUpiLink({ ...base, amount: -100 })).toThrow(UpiConfigError);
  });
});

describe('upiAppLinks', () => {
  it('offers per-app schemes carrying the same parameters', () => {
    const link = buildUpiLink({
      vpa: 'ironcore@okaxis',
      payeeName: 'Iron Core',
      amount: 1200,
      transactionRef: 'ICF1',
    });
    const apps = upiAppLinks(link);

    expect(apps.map((app) => app.label)).toEqual(['Google Pay', 'PhonePe', 'Paytm', 'Other UPI app']);
    for (const app of apps) {
      expect(app.href).toContain('pa=ironcore%40okaxis');
      expect(app.href).toContain('am=1200.00');
    }
  });
});

describe('normaliseUpiReference', () => {
  it('accepts the 12-digit UTR UPI apps show', () => {
    expect(normaliseUpiReference('123456789012')).toBe('123456789012');
  });

  it('ignores the spacing members paste in', () => {
    expect(normaliseUpiReference(' 1234 5678 9012 ')).toBe('123456789012');
    expect(normaliseUpiReference('1234-5678-9012')).toBe('123456789012');
  });

  it('upper-cases alphanumeric references from other apps', () => {
    expect(normaliseUpiReference('axb1234cd567')).toBe('AXB1234CD567');
  });

  it('rejects anything too short to be real', () => {
    expect(normaliseUpiReference('12345')).toBeNull();
    expect(normaliseUpiReference('')).toBeNull();
    expect(normaliseUpiReference(null)).toBeNull();
  });

  it('rejects anything absurdly long', () => {
    expect(normaliseUpiReference('1'.repeat(40))).toBeNull();
  });
});

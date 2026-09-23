/**
 * Phone number handling.
 *
 * The gym's members type their number however they like — "98765 43210",
 * "098765 43210", "+91 98765-43210". Everything is stored as E.164 so the
 * uniqueness constraint, tel: links and the SMS gateway all agree.
 */

const DEFAULT_COUNTRY_CODE = '91';

export class InvalidPhoneError extends Error {
  constructor(input: string) {
    super(`"${input}" is not a valid mobile number.`);
    this.name = 'InvalidPhoneError';
  }
}

/**
 * Normalises to E.164 (`+919876543210`), or returns null if it cannot.
 * Indian mobile numbers are ten digits beginning 6-9.
 */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  const hadPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) return null;

  // An explicitly international number we don't recognise as Indian is kept
  // as-is, so the gym can register the occasional overseas member.
  if (hadPlus && !digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // 00 91 ... international prefix
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Trunk prefix: 0 98765 43210
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  // Country code already present
  if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    digits = digits.slice(DEFAULT_COUNTRY_CODE.length);
  }
  if (digits.length === 13 && digits.startsWith(`0${DEFAULT_COUNTRY_CODE}`)) {
    digits = digits.slice(DEFAULT_COUNTRY_CODE.length + 1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    // Not an Indian mobile. Accept a bare international number if it looks sane.
    if (hadPlus && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return null;
  }

  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

export function requirePhone(input: string | null | undefined): string {
  const normalised = normalisePhone(input);
  if (!normalised) throw new InvalidPhoneError(String(input ?? ''));
  return normalised;
}

export function isValidPhone(input: string | null | undefined): boolean {
  return normalisePhone(input) !== null;
}

/** `+919876543210` -> `+91 98765 43210`, for display only. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  if (match) return `+91 ${match[1]} ${match[2]}`;
  return phone;
}

/** The last four digits, for "code sent to ••••3210" copy. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return `••••••${digits.slice(-4)}`;
}

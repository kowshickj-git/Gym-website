/**
 * UPI Direct.
 *
 * Builds the `upi://pay` deep link defined by NPCI's UPI Linking Specification.
 * Every UPI app on an Indian phone — GPay, PhonePe, Paytm, BHIM, a bank app —
 * understands it, and the money moves from the member's account straight into
 * the gym's. No gateway sits in the middle, so nobody takes a percentage.
 *
 * What this cannot do is tell us the payment happened: UPI has no callback to
 * a merchant server. Confirmation is therefore a human step — see
 * fn_confirm_upi_payment in the migrations.
 */

export interface UpiLinkParams {
  /** The gym's Virtual Payment Address, e.g. `ironcore@okaxis`. */
  vpa: string;
  /** Payee name shown in the member's UPI app. */
  payeeName: string;
  /** Rupees. Rendered to exactly two decimal places. */
  amount: number;
  /** Our own reference, echoed back on the bank statement where supported. */
  transactionRef: string;
  /** Short note shown in the app, e.g. "Iron Core 6 Months". */
  note?: string;
}

/** A VPA is `identifier@handle`. Deliberately permissive about the handle. */
const VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-]{1,32}$/;

export function isValidVpa(vpa: string | null | undefined): boolean {
  return typeof vpa === 'string' && VPA_PATTERN.test(vpa.trim());
}

/**
 * The UPI spec allows only alphanumerics in `tr`, capped at 35 characters.
 * A UUID with the hyphens removed is 32, which fits with room for a prefix.
 */
export function upiTransactionRef(paymentId: string, prefix = 'ICF'): string {
  const compact = paymentId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${prefix}${compact}`.slice(0, 35);
}

/** Keeps a note inside what UPI apps reliably display, and strips odd characters. */
function sanitiseNote(note: string): string {
  return note.replace(/[^\w\s.\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
}

export class UpiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpiConfigError';
  }
}

/**
 * Builds the deep link.
 *
 * `am` and `cu` are both included so the amount is locked in the member's app —
 * without them the app opens with an empty amount box and members mistype it.
 */
export function buildUpiLink(params: UpiLinkParams): string {
  const vpa = params.vpa.trim();
  if (!isValidVpa(vpa)) {
    throw new UpiConfigError(`"${params.vpa}" is not a valid UPI id.`);
  }

  const amount = Math.round(params.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new UpiConfigError('The amount must be greater than zero.');
  }

  const query = new URLSearchParams();
  query.set('pa', vpa);
  query.set('pn', params.payeeName.trim().slice(0, 50) || 'Gym');
  query.set('am', amount.toFixed(2));
  query.set('cu', 'INR');
  query.set('tr', params.transactionRef);
  if (params.note) query.set('tn', sanitiseNote(params.note));

  // UPI apps expect %20 for spaces rather than the "+" URLSearchParams emits.
  return `upi://pay?${query.toString().replace(/\+/g, '%20')}`;
}

/**
 * App-specific variants.
 *
 * Android resolves `upi://` to a chooser, but iOS does not register the scheme
 * for every app, so offering the three common apps directly is the difference
 * between a payment working and a member giving up.
 */
export function upiAppLinks(link: string): { label: string; href: string }[] {
  const query = link.slice(link.indexOf('?'));
  return [
    { label: 'Google Pay', href: `tez://upi/pay${query}` },
    { label: 'PhonePe', href: `phonepe://pay${query}` },
    { label: 'Paytm', href: `paytmmp://pay${query}` },
    { label: 'Other UPI app', href: link },
  ];
}

/**
 * The reference a member reads off their UPI app after paying.
 *
 * Usually a 12-digit UTR, but some apps show a longer alphanumeric id, so the
 * check stays broad — the real verification is a human matching it against the
 * gym's bank SMS.
 */
export function normaliseUpiReference(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() ?? '';
  return /^[A-Z0-9]{6,32}$/.test(cleaned) ? cleaned : null;
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TIMEZONE } from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrFormatterPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats rupees the Indian way: ₹1,20,000 rather than ₹120,000. */
export function formatCurrency(amount: number | string | null | undefined, showPaise = false): string {
  const value = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(value)) return '₹0';
  const hasPaise = Math.round(value * 100) % 100 !== 0;
  return showPaise || hasPaise ? inrFormatterPaise.format(value) : inrFormatter.format(value);
}

export function formatCompactCurrency(amount: number | null | undefined): string {
  const value = amount ?? 0;
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return formatCurrency(value);
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: TIMEZONE,
});

/**
 * Parses a value that may be a plain `YYYY-MM-DD` date or a timestamp.
 * Plain dates are anchored at noon UTC so a timezone shift never moves them to
 * the neighbouring day when rendered in IST.
 */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}

/** Today's date in IST as `YYYY-MM-DD`, regardless of server timezone. */
export function todayInIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

const MS_PER_DAY = 86_400_000;

/** Whole days from today until `value`. Negative once the date has passed. */
export function daysUntil(value: string | Date | null | undefined): number | null {
  const target = toDate(value);
  if (!target) return null;
  const today = toDate(todayInIst());
  if (!today) return null;
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

export function formatDaysRemaining(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'No active plan';
  if (days < 0) return `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Greeting keyed to the hour in IST. */
export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TIMEZONE }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Builds a `wa.me` deep link with an optional pre-filled message. */
export function whatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '');
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Rounds to two decimals without the usual floating-point drift. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

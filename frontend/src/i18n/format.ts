import { getLocale, INTL_LOCALES, type Locale } from "./locale";

/**
 * Numbers and dates in the UI language - never `toLocaleString()` with no
 * locale (that's the browser's, which may not be the one picked, and
 * differs between the server render and the browser). Pass `locale` from
 * `useLocale()` inside a component so it re-renders on a switch.
 */

export function intlLocale(locale: Locale = getLocale()): string {
  return INTL_LOCALES[locale];
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "Oct 31, 2026" / "31 thg 10, 2026". */
export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions, locale?: Locale): string {
  return toDate(value).toLocaleDateString(intlLocale(locale), options ?? { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions, locale?: Locale): string {
  return toDate(value).toLocaleString(
    intlLocale(locale),
    options ?? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
  );
}

export function formatTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions, locale?: Locale): string {
  return toDate(value).toLocaleTimeString(intlLocale(locale), options ?? { hour: "2-digit", minute: "2-digit" });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago" / "3 ngày trước", "in 2 hours" / "sau 2 giờ nữa". */
export function formatRelative(value: Date | string | number, now: Date = new Date(), locale?: Locale): string {
  const seconds = Math.round((toDate(value).getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

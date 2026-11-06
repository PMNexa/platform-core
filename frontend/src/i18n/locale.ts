/**
 * The UI language - one store for every module (each package imports
 * platform-core, which resolves to a single module instance).
 *
 * Where the choice lives: the `gn_lang` cookie. The server reads the same
 * cookie (the host's root loader, for `<html lang>` and the first render;
 * Django's `LocaleMiddleware` via `LANGUAGE_COOKIE_NAME`, for API
 * messages), so the server-rendered page is already in the right language
 * and no request has to carry a header. A signed-in user's saved
 * language (platform-auth's `User.language`) wins when the session loads
 * (`applyUserLocale`). No cookie: the browser's language, else English.
 *
 * Client-only state: during SSR `useLocale()` reads `LocaleProvider`'s
 * value instead (module state would be shared by concurrent requests).
 */

export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "gn_lang";

/** Each language's own name, for a picker (never translated). */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", vi: "Tiếng Việt" };

/** The BCP 47 tag `Intl` formats with. */
export const INTL_LOCALES: Record<Locale, string> = { en: "en-US", vi: "vi-VN" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** "vi-VN" -> "vi"; unknown -> null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/** The cookie's value in a `Cookie` header (or `document.cookie`). */
export function localeFromCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return matchLocale(decodeURIComponent(rest.join("=")));
  }
  return null;
}

/** First supported language in an `Accept-Language` header. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag, q: q === undefined ? 1 : Number(q) };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return null;
}

/** For a server render: the cookie, else the browser's languages, else English. */
export function localeFromRequest(request: Request): Locale {
  return (
    localeFromCookie(request.headers.get("cookie")) ??
    localeFromAcceptLanguage(request.headers.get("accept-language")) ??
    DEFAULT_LOCALE
  );
}

/**
 * The language a react-router `meta` function should use: the host's
 * root loader data (`{ locale }`, main's root.tsx) among `matches` - so a
 * page title is right in the server render too. Falls back to `getLocale()`.
 */
export function localeFromMatches(matches: readonly unknown[] | undefined): Locale {
  for (const match of matches ?? []) {
    // react-router 8 calls it `loaderData`; 7 had `data`.
    const m = match as { loaderData?: { locale?: unknown }; data?: { locale?: unknown } } | undefined;
    const data = m?.loaderData ?? m?.data;
    if (isLocale(data?.locale)) return data.locale;
  }
  return getLocale();
}

let current: Locale | null = null;
const subscribers = new Set<() => void>();

function detect(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const fromCookie = localeFromCookie(document.cookie);
  if (fromCookie) return fromCookie;
  const languages = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  for (const tag of languages) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** The language in effect (client). Outside a component, for strings built on demand. */
export function getLocale(): Locale {
  if (current === null) current = detect();
  return current;
}

/** Switches the whole UI. Remembered in the cookie for this browser (a year). */
export function setLocale(next: Locale): void {
  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
  }
  if (next === current) return;
  current = next;
  for (const callback of subscribers) callback();
}

/** A signed-in user's saved language, applied when the session loads (blank = keep this browser's). */
export function applyUserLocale(language: string | null | undefined): void {
  const match = matchLocale(language);
  if (match && match !== getLocale()) setLocale(match);
}

export function subscribeLocale(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

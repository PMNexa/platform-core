import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, getLocale, subscribeLocale, type Locale } from "./locale";

/**
 * Translated strings. Each module keeps its own catalogs next to the code
 * that uses them (`messages.ts` beside a screen or feature):
 *
 *   const messages = defineMessages({
 *     en: { title: "Goals", count: (v: { n: number }) => (v.n === 1 ? "1 goal" : `${v.n} goals`) },
 *     vi: { title: "Mục tiêu", count: (v) => `${v.n} mục tiêu` },
 *   });
 *   const t = useT(messages);  t("title")  t("count", { n: 3 })
 *
 * English is the source: its keys are the catalog's keys, and `vi` must
 * have every one of them (a missing key is a type error, not a silent
 * English fallback). A message is a string - `{name}` placeholders are
 * filled from `vars` - or a function of `vars` for plurals and anything
 * that needs logic. A function may return JSX (a link inside a sentence);
 * use `t.rich` to get that as a ReactNode.
 */

type Vars = Record<string, unknown>;
// oxlint-disable-next-line typescript/no-explicit-any
type Message = string | ((vars: any) => ReactNode);
export type MessageMap = Record<string, Message>;
type Translation<E extends MessageMap> = { [K in keyof E]: E[K] extends string ? string : E[K] };
export type Catalog<E extends MessageMap> = { en: E } & Record<Exclude<Locale, "en">, Translation<E>>;

type VarsOf<M> = M extends (vars: infer V) => unknown ? V : Vars | undefined;

export interface Translate<E extends MessageMap> {
  <K extends keyof E & string>(key: K, ...vars: E[K] extends string ? [Vars?] : [VarsOf<E[K]>]): string;
  /** Same, but keeps JSX a message function returns. */
  rich<K extends keyof E & string>(key: K, ...vars: E[K] extends string ? [Vars?] : [VarsOf<E[K]>]): ReactNode;
  locale: Locale;
}

export function defineMessages<E extends MessageMap>(catalog: Catalog<E>): Catalog<E> {
  return catalog;
}

/** Fills `{name}` placeholders; an unknown one is left as is. */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name] ?? "") : match));
}

function lookup<E extends MessageMap>(catalog: Catalog<E>, locale: Locale, key: string, vars?: Vars): ReactNode {
  const table = catalog[locale] as MessageMap;
  const message = (table && key in table ? table[key] : (catalog.en as MessageMap)[key]) ?? key;
  return typeof message === "function" ? message(vars ?? {}) : interpolate(message, vars);
}

/** A translator for a given language - outside React, or for a language other than the UI's. */
export function translator<E extends MessageMap>(catalog: Catalog<E>, locale: Locale = getLocale()): Translate<E> {
  const t = ((key: string, vars?: Vars) => {
    const value = lookup(catalog, locale, key, vars);
    return typeof value === "string" ? value : String(value ?? "");
  }) as unknown as Translate<E>;
  t.rich = ((key: string, vars?: Vars) => lookup(catalog, locale, key, vars)) as Translate<E>["rich"];
  t.locale = locale;
  return t;
}

/** Translate once, in the current language (nav builders, `document.title`, alerts). */
export function translate<E extends MessageMap, K extends keyof E & string>(
  catalog: Catalog<E>,
  key: K,
  ...vars: E[K] extends string ? [Vars?] : [VarsOf<E[K]>]
): string {
  return translator(catalog)(key, ...vars);
}

const ServerLocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The host wraps the app in this with the language it rendered on the
 * server (from the request's cookie) - what `useLocale()` returns during
 * SSR and hydration, so the first client render matches the HTML.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <ServerLocaleContext.Provider value={locale}>{children}</ServerLocaleContext.Provider>;
}

/** The UI language; re-renders on a switch. */
export function useLocale(): Locale {
  const serverLocale = useContext(ServerLocaleContext);
  return useSyncExternalStore(subscribeLocale, getLocale, () => serverLocale);
}

/** `t` for a catalog, in the UI language. */
export function useT<E extends MessageMap>(catalog: Catalog<E>): Translate<E> {
  const locale = useLocale();
  return useMemo(() => translator(catalog, locale), [catalog, locale]);
}

/**
 * One message as an element - for a label built outside a component (a
 * nav builder's entries), so it still follows the UI language and renders
 * right on the server.
 */
export function Msg<E extends MessageMap>({ catalog, k, vars }: { catalog: Catalog<E>; k: keyof E & string; vars?: Vars }) {
  const t = useT(catalog) as unknown as { rich: (key: string, vars?: Vars) => ReactNode };
  return <>{t.rich(k, vars)}</>;
}

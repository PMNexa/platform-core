import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatNumber } from "./format";
import { localeFromAcceptLanguage, localeFromCookie, matchLocale, setLocale } from "./locale";
import { defineMessages, interpolate, translator, useT } from "./messages";

const messages = defineMessages({
  en: { hello: "Hello, {name}", goals: (v: { n: number }) => (v.n === 1 ? "1 goal" : `${v.n} goals`) },
  vi: { hello: "Xin chào, {name}", goals: (v: { n: number }) => `${v.n} mục tiêu` },
});

afterEach(() => setLocale("en"));

describe("locale parsing", () => {
  it("matches a language tag to a supported locale", () => {
    expect(matchLocale("vi-VN")).toBe("vi");
    expect(matchLocale("EN_us")).toBe("en");
    expect(matchLocale("fr")).toBeNull();
  });

  it("reads the cookie and Accept-Language", () => {
    expect(localeFromCookie("a=1; gn_lang=vi; b=2")).toBe("vi");
    expect(localeFromCookie("gn_lang=xx")).toBeNull();
    expect(localeFromAcceptLanguage("fr;q=0.9, vi;q=0.8, en;q=0.5")).toBe("vi");
  });
});

describe("messages", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("translates strings and functions per locale", () => {
    expect(translator(messages, "en")("hello", { name: "An" })).toBe("Hello, An");
    expect(translator(messages, "vi")("hello", { name: "An" })).toBe("Xin chào, An");
    expect(translator(messages, "en")("goals", { n: 1 })).toBe("1 goal");
    expect(translator(messages, "vi")("goals", { n: 3 })).toBe("3 mục tiêu");
  });

  it("re-renders a component when the language changes", () => {
    function Greeting() {
      const t = useT(messages);
      return <p>{t("hello", { name: "An" })}</p>;
    }
    render(<Greeting />);
    expect(screen.getByText("Hello, An")).toBeInTheDocument();
    act(() => setLocale("vi"));
    expect(screen.getByText("Xin chào, An")).toBeInTheDocument();
    expect(document.cookie).toContain("gn_lang=vi");
    expect(document.documentElement.lang).toBe("vi");
  });

  it("formats numbers in the language's style", () => {
    expect(formatNumber(57000, undefined, "en")).toBe("57,000");
    expect(formatNumber(57000, undefined, "vi")).toBe("57.000");
  });
});

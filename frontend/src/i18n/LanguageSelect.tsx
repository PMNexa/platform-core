import { LOCALE_NAMES, LOCALES, setLocale, type Locale } from "./locale";
import { useLocale } from "./messages";

export interface LanguageSelectProps {
  /** Called after the UI switched - e.g. to save it on the user's account. */
  onChange?: (locale: Locale) => void;
  id?: string;
  className?: string;
}

/** The language picker: each language in its own name. */
export default function LanguageSelect({ onChange, id, className = "form-select" }: LanguageSelectProps) {
  const locale = useLocale();
  return (
    <select
      id={id}
      className={className}
      value={locale}
      aria-label="Language / Ngôn ngữ"
      onChange={(event) => {
        const next = event.target.value as Locale;
        setLocale(next);
        onChange?.(next);
      }}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code} lang={code}>
          {LOCALE_NAMES[code]}
        </option>
      ))}
    </select>
  );
}

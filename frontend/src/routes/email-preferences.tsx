import { useOutletContext } from "react-router";
import EmailPreferencesScreen from "../email/EmailPreferencesScreen";
import { localeFromMatches, translator } from "../i18n";
import messages from "./messages";

// oxlint-disable-next-line react/only-export-components
export function meta({ matches }: { matches?: readonly unknown[] }) {
  return [{ title: translator(messages, localeFromMatches(matches))("emailPreferences") }];
}

/** Registered by `createEmailRoutes()`. */
export default function EmailPreferencesRoute() {
  const accessToken = useOutletContext<string>();
  return <EmailPreferencesScreen accessToken={accessToken} />;
}

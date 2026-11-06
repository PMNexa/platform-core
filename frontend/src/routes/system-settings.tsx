import { useOutletContext } from "react-router";
import SystemSettingsScreen from "../system/SystemSettingsScreen";
import { localeFromMatches, translator } from "../i18n";
import messages from "./messages";

// oxlint-disable-next-line react/only-export-components
export function meta({ matches }: { matches?: readonly unknown[] }) {
  return [{ title: translator(messages, localeFromMatches(matches))("settings") }];
}

/** Registered by `createSystemRoutes()`; the token comes from the host's app-shell layout. */
export default function SystemSettingsRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemSettingsScreen accessToken={accessToken} />;
}

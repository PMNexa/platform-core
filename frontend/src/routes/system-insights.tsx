import { useOutletContext } from "react-router";
import SystemInsightsScreen from "../system/SystemInsightsScreen";
import { localeFromMatches, translator } from "../i18n";
import messages from "./messages";

// oxlint-disable-next-line react/only-export-components
export function meta({ matches }: { matches?: readonly unknown[] }) {
  return [{ title: translator(messages, localeFromMatches(matches))("insights") }];
}

/** Registered by `createSystemRoutes()`. */
export default function SystemInsightsRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemInsightsScreen accessToken={accessToken} />;
}

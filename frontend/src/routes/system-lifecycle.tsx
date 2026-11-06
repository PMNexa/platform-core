import { useOutletContext } from "react-router";
import SystemLifecycleScreen from "../lifecycle/SystemLifecycleScreen";
import { localeFromMatches, translator } from "../i18n";
import messages from "./messages";

// oxlint-disable-next-line react/only-export-components
export function meta({ matches }: { matches?: readonly unknown[] }) {
  return [{ title: translator(messages, localeFromMatches(matches))("lifecycle") }];
}

/** Registered by `createSystemRoutes()`. */
export default function SystemLifecycleRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemLifecycleScreen accessToken={accessToken} />;
}

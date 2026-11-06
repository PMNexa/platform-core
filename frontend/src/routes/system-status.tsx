import { useOutletContext } from "react-router";
import SystemStatusScreen from "../system/SystemStatusScreen";
import { localeFromMatches, translator } from "../i18n";
import messages from "./messages";

// oxlint-disable-next-line react/only-export-components
export function meta({ matches }: { matches?: readonly unknown[] }) {
  return [{ title: translator(messages, localeFromMatches(matches))("status") }];
}

/** Registered by `createSystemRoutes()`. */
export default function SystemStatusRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemStatusScreen accessToken={accessToken} />;
}

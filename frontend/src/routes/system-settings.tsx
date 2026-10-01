import { useOutletContext } from "react-router";
import SystemSettingsScreen from "../system/SystemSettingsScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "System settings" }];
}

/** Registered by `createSystemRoutes()`; the token comes from the host's app-shell layout. */
export default function SystemSettingsRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemSettingsScreen accessToken={accessToken} />;
}

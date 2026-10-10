import { useOutletContext } from "react-router";
import SystemLifecycleScreen from "../lifecycle/SystemLifecycleScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "Lifecycle email" }];
}

/** Registered by `createSystemRoutes()`. */
export default function SystemLifecycleRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemLifecycleScreen accessToken={accessToken} />;
}

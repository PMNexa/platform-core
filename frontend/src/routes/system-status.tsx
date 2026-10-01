import { useOutletContext } from "react-router";
import SystemStatusScreen from "../system/SystemStatusScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "System status" }];
}

/** Registered by `createSystemRoutes()`. */
export default function SystemStatusRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemStatusScreen accessToken={accessToken} />;
}

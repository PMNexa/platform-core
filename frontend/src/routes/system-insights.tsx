import { useOutletContext } from "react-router";
import SystemInsightsScreen from "../system/SystemInsightsScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "Insights" }];
}

/** Registered by `createSystemRoutes()`. */
export default function SystemInsightsRoute() {
  const accessToken = useOutletContext<string>();
  return <SystemInsightsScreen accessToken={accessToken} />;
}

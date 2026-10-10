import { useOutletContext } from "react-router";
import EmailPreferencesScreen from "../email/EmailPreferencesScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "Email preferences" }];
}

/** Registered by `createEmailRoutes()`. */
export default function EmailPreferencesRoute() {
  const accessToken = useOutletContext<string>();
  return <EmailPreferencesScreen accessToken={accessToken} />;
}

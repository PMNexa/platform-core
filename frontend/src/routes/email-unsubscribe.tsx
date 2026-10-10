import { useParams } from "react-router";
import UnsubscribeScreen from "../email/UnsubscribeScreen";

// oxlint-disable-next-line react/only-export-components
export function meta() {
  return [{ title: "Email preferences" }];
}

/** Registered by `createEmailPublicRoutes()` - signed out, outside the app shell. */
export default function EmailUnsubscribeRoute() {
  const { token = "" } = useParams();
  return <UnsubscribeScreen token={token} />;
}

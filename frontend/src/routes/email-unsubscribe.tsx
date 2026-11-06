import { useParams } from "react-router";
import UnsubscribeScreen from "../email/UnsubscribeScreen";
import { localeFromMatches, translator } from "../i18n";
import messages from "./messages";

// oxlint-disable-next-line react/only-export-components
export function meta({ matches }: { matches?: readonly unknown[] }) {
  return [{ title: translator(messages, localeFromMatches(matches))("emailPreferences") }];
}

/** Registered by `createEmailPublicRoutes()` - signed out, outside the app shell. */
export default function EmailUnsubscribeRoute() {
  const { token = "" } = useParams();
  return <UnsubscribeScreen token={token} />;
}

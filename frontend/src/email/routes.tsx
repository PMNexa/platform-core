import { routeFilePath, type RouteEntry } from "../containers/CrudRouter/lib/routes";

/**
 * The signed-in user's email preferences - mount inside the app shell:
 * `createEmailRoutes("email")` gives `/email/preferences`. Browser-safe
 * like every route builder here.
 */
export function createEmailRoutes(basePath: string): RouteEntry[] {
  const base = basePath.replace(/^\/+|\/+$/g, "");
  return [
    {
      id: "platform-email-preferences",
      path: `${base}/preferences`,
      file: routeFilePath(import.meta.url, "../routes/email-preferences.tsx"),
    },
  ];
}

/**
 * The unsubscribe page an email's footer links to - signed out, so mount
 * it OUTSIDE the app shell, with the same `basePath`: `/email/unsubscribe/:token`
 * (the backend's `PLATFORM_EMAIL_UNSUBSCRIBE_PAGE` default).
 */
export function createEmailPublicRoutes(basePath: string): RouteEntry[] {
  const base = basePath.replace(/^\/+|\/+$/g, "");
  return [
    {
      id: "platform-email-unsubscribe",
      path: `${base}/unsubscribe/:token`,
      file: routeFilePath(import.meta.url, "../routes/email-unsubscribe.tsx"),
    },
  ];
}

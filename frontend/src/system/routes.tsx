import type { NavEntry, NavItem } from "../components/types";
import SystemIcon from "./SystemIcon";
import { translate } from "../i18n";
import messages from "./messages";
import { createCrudRoutes, prefixRoutes, routeFilePath, type RouteEntry } from "../containers/CrudRouter/lib/routes";

/**
 * The system admin's pages, under a HOST-chosen mount
 * (`createSystemRoutes("system")`): `settings` (SystemSettingsScreen),
 * `status`, `insights` (SystemInsightsScreen), `lifecycle`
 * (SystemLifecycleScreen), `audit-events`, `outgoing-emails`,
 * `lifecycle-emails` and `email-suppressions` (the audit log, the email
 * delivery log, every lifecycle email, the suppression list - generic,
 * schema-driven lists with search and filters).
 * Browser-safe like every route builder here.
 */
export function createSystemRoutes(basePath: string): RouteEntry[] {
  const base = basePath.replace(/^\/+|\/+$/g, "");
  return [
    {
      id: "platform-system-settings",
      path: `${base}/settings`,
      file: routeFilePath(import.meta.url, "../routes/system-settings.tsx"),
    },
    {
      id: "platform-system-status",
      path: `${base}/status`,
      file: routeFilePath(import.meta.url, "../routes/system-status.tsx"),
    },
    {
      id: "platform-system-insights",
      path: `${base}/insights`,
      file: routeFilePath(import.meta.url, "../routes/system-insights.tsx"),
    },
    {
      id: "platform-system-lifecycle",
      path: `${base}/lifecycle`,
      file: routeFilePath(import.meta.url, "../routes/system-lifecycle.tsx"),
    },
    ...prefixRoutes(base, [
      ...createCrudRoutes("/api/v1/audit-events"),
      ...createCrudRoutes("/api/v1/outgoing-emails"),
      ...createCrudRoutes("/api/v1/delivery-attempts"),
      ...createCrudRoutes("/api/v1/lifecycle-emails"),
      ...createCrudRoutes("/api/v1/email-suppressions"),
    ]),
  ];
}

/**
 * The "System" sidebar group - pass the SAME `basePath` as
 * `createSystemRoutes`; `extra` adds other modules' admin pages (e.g.
 * platform-org's "All organizations") after Settings. Labels are in the current language (called during render). Each link carries its permission, so the group
 * only shows for admins (run it through the host's permission filter).
 */
export function createSystemNavItems(basePath: string, extra: NavItem[] = []): NavEntry[] {
  const base = `/${basePath.replace(/^\/+|\/+$/g, "")}`;
  return [
    {
      label: translate(messages, "navSystem"),
      icon: <SystemIcon />,
      children: [
        { label: translate(messages, "navStatus"), to: `${base}/status`, permission: "system-settings.view" },
        { label: translate(messages, "navInsights"), to: `${base}/insights`, permission: "system-settings.view" },
        { label: translate(messages, "navSettings"), to: `${base}/settings`, permission: "system-settings.view" },
        ...extra,
        { label: translate(messages, "navAuditLog"), to: `${base}/audit-events`, permission: "audit-events.view" },
        { label: translate(messages, "navEmailLog"), to: `${base}/outgoing-emails`, permission: "outgoing-emails.view" },
        { label: translate(messages, "navNotificationLog"), to: `${base}/delivery-attempts`, permission: "delivery-attempts.view" },
        { label: translate(messages, "navLifecycle"), to: `${base}/lifecycle`, permission: "lifecycle-emails.view" },
        { label: translate(messages, "navSuppressed"), to: `${base}/email-suppressions`, permission: "email-suppressions.view" },
      ],
    },
  ];
}

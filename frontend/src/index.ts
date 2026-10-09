/**
 * Package entry point - what a consuming app (apps/main) imports.
 * `components/` (this package's whole design system) and `containers/`
 * (stateful feature compositions built on it) each have their own
 * docstring and AGENTS.md section; this file just re-exports both.
 */
export * from "./components";
export * from "./containers";
// For a host's own route module that renders a CRUD screen outside the
// generic route files (e.g. a detail screen in a drawer) and wants its
// relation links to land where the host mounted each resource.
export { useResourcePath } from "./routes/useResourcePath";

// System administration (platform_system's admin API): settings, audit
// log, email log - pages and their sidebar group.
export { default as SystemSettingsScreen } from "./system/SystemSettingsScreen";
export type { SystemSettingsScreenProps } from "./system/SystemSettingsScreen";
export { createSystemNavItems, createSystemRoutes } from "./system/routes";
export { default as SystemStatusScreen } from "./system/SystemStatusScreen";
export { default as SystemInsightsScreen } from "./system/SystemInsightsScreen";
export { default as AnnouncementBanner } from "./system/AnnouncementBanner";

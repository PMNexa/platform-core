/**
 * Route-config builders a host's `routes.ts` calls - exported from this
 * package's main `"."` entry (no separate `"./routes"` subpath). That
 * entry IS client-bundled (`AppShell` etc. ride along into
 * `app-shell.tsx`), so this file must stay browser-safe:
 * - no `@react-router/dev/routes` import (Node-only tooling; used to cost
 *   ~16KB in the client bundle when it leaked into `"."`) - these build
 *   the same plain route-config objects its `index()`/`route()`/
 *   `prefix()` helpers do, and the host's own `satisfies RouteConfig`
 *   still type-checks them;
 * - no `node:path`/`node:url`, and nothing computed at module load -
 *   file paths are string ops on `import.meta.url`, only run when a
 *   builder is CALLED, which only happens in Node (react-router's tooling
 *   reading the host's `routes.ts`). Not `new URL(..., import.meta.url)`:
 *   Vite rewrites that pattern into a bundled asset reference.
 * Every function here is unused by client code, so it tree-shakes out.
 */
export interface RouteEntry {
  id?: string;
  path?: string;
  index?: boolean;
  file: string;
  children?: RouteEntry[];
}

/**
 * Absolute filesystem path of `relativePath`, resolved against the
 * directory of the module whose `import.meta.url` is passed in (Node's
 * `file://` URL) - self-referential, so it never bakes in the CALLER's
 * directory depth. Exported for sibling packages building their own
 * route lists (platform-auth-frontend, goalnexa-frontend, ...).
 */
export function routeFilePath(moduleUrl: string, relativePath: string): string {
  const segments = moduleUrl.replace(/^file:\/\//, "").split("/");
  segments.pop();
  for (const part of relativePath.split("/")) {
    if (part === "..") segments.pop();
    else if (part !== "." && part !== "") segments.push(part);
  }
  return decodeURIComponent(segments.join("/"));
}

/**
 * Same as `@react-router/dev/routes`'s `prefix()`: joins `prefixPath`
 * onto every top-level entry's path (an index entry takes `prefixPath`
 * as its own path), no wrapping layout/`<Outlet/>`.
 */
export function prefixRoutes(prefixPath: string, routes: RouteEntry[]): RouteEntry[] {
  const base = prefixPath.replace(/\/+$/, "");
  return routes.map((route) => {
    if (route.index || typeof route.path === "string") {
      return { ...route, path: route.path ? `${base}/${route.path.replace(/^\/+/, "")}` : base };
    }
    if (route.children) return { ...route, children: prefixRoutes(prefixPath, route.children) };
    return route;
  });
}

/**
 * The four routes every `BaseViewSet`-backed resource needs (list/
 * create/detail/edit), `prefixRoutes()`-nested under the resource's own name
 * (not `route()` + children - that needs a wrapping layout element with
 * its own `<Outlet/>`, which none of them share or need) and ALL
 * of them pointing at platform-core's own generic route files by default
 * (`src/routes/crud-list.tsx`/etc - shared by every resource, see their
 * own docstrings). A host registers a whole resource with one call,
 * giving only the resource's own backend base URL:
 * ```ts
 * // apps/main/frontend/app/routes.ts
 * import { createCrudRoutes } from "platform-core";
 * ...
 * layout("routes/app-shell.tsx", [
 *   ...createCrudRoutes("/api/v1/goals"),
 * ]),
 * ```
 */
export interface CrudRoutesOptions {
  /**
   * An absolute path to a HOST-OWNED route file to use instead of the
   * generic `crud-edit.tsx` for this resource's edit route - the escape
   * hatch for a resource whose edit page needs more than the plain
   * schema-driven form (e.g. goalnexa's own `goals-edit.tsx`). Build it
   * with `routeFilePath(import.meta.url, ...)` from the file that owns
   * it - a relative string would bake in an assumption about this
   * file's own location.
   */
  editFile?: string;
  /** Same as `editFile`, for the detail route (`:id`, the generic `crud-detail.tsx`). */
  detailFile?: string;
  /** Same as `editFile`, for the list route (the index, the generic `crud-list.tsx`). */
  listFile?: string;
}

export function createCrudRoutes(apiPath: string, options: CrudRoutesOptions = {}): RouteEntry[] {
  const resource = apiPath.split("/").filter(Boolean).pop() ?? apiPath;
  // `../../../routes` from this file (`src/containers/CrudRouter/lib/`)
  // is `src/routes/`.
  const file = (name: string) => routeFilePath(import.meta.url, `../../../routes/${name}`);
  // Every resource points at the SAME files by default -
  // react-router derives a route's `id` from its `file` by default, so
  // without an explicit one here, two resources registering the same
  // file would collide ("duplicate route id", confirmed the hard way).
  return prefixRoutes(resource, [
    { index: true, file: options.listFile ?? file("crud-list.tsx"), id: `crud-list-${resource}` },
    { path: "new", file: file("crud-new.tsx"), id: `crud-new-${resource}` },
    { path: ":id", file: options.detailFile ?? file("crud-detail.tsx"), id: `crud-detail-${resource}` },
    { path: ":id/edit", file: options.editFile ?? file("crud-edit.tsx"), id: `crud-edit-${resource}` },
  ]);
}

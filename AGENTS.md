# AGENTS.md

Guidance for AI coding agents (Claude Code and others — this repo follows
the cross-tool `AGENTS.md` convention, not a Claude-specific file) working
in this repo.

## What this repo is now

platform-core used to be a starter kit bundling auth, orgs, RBAC, and a
generic CRUD factory (FastAPI + SQLAlchemy + Alembic). That's gone: the
backend was rewritten on Django + DRF and stripped down to a pure
**kernel with no models of its own** — shared conventions other modules
build on (error contract, pagination, filters, uuid7/timestamp utils,
`BaseSerializer`/`BaseViewSet`), nothing else. Auth now lives in its own
module (`platform-auth`); orgs/RBAC/product features are expected to
become their own modules the same way, not get added back here.

**No longer just "kept for reference".** `platform-auth` and
`platform-org` both depend on this repo's `core_api` for real now (see
their own AGENTS.md) - each used to vendor its own near-identical copy of
`errors.py`/`exceptions.py`/`utils.py` (a deliberate "modules share
nothing at source level" choice from when this repo was still the
Module-Federation-era kernel, not in active use). That copy-per-module
approach doesn't scale once a module needs `BaseSerializer`/`BaseViewSet`
(real, nontrivial code, not three small files worth re-vendoring
everywhere) - so this is now a genuine shared dependency, installed
editable alongside every module that needs it (see
`apps/main`'s root `AGENTS.md` and `docker-compose.yml`). The frontend
half (Module Federation shell) is unaffected and still not part of the
default `docker-compose.yml` - this change is backend-only.

## Repo layout

| Path | What |
|---|---|
| `backend/` | Django + DRF. `config/` (settings/urls/wsgi/asgi), `core_api/` (errors, exceptions, pagination, filters, uuid7 utils, `BaseSerializer`/`BaseViewSet` — a library, not a Django app; no models). Real routes: `GET /api/health`, `GET /api/modules` — under `/api`, same convention every module in this platform follows. |
| `frontend/` | Two things sharing one package: (1) its own React + Vite + TS + react-router-dom Module Federation shell — no design system, no admin CRUD surface (that's gone, see history note below); fetches `GET /api/modules`, loads a module's `remote_entry` and renders it inline when present, falls back to a plain `url_prefix` link otherwise; and (2) the `platform-core` npm package (`src/index.ts`, `exports` in `package.json`) that `apps/main` imports as a `file:` dependency for `AppShell` (sidemenu + sticky header) — see "AppShell" below. |

`core_api/modules.py` reads `MODULES_MANIFEST_PATH` (an env var, not a
hardcoded path) to find the consuming platform's `modules.yaml` — this
repo is reused across platforms and must never assume where a given one
keeps its manifest. Unset var / missing file -> empty list, not an error.
`ModuleConfig.url_prefix`/`remote_entry` are both optional (a backend-only
module, or platform-core itself at the gateway root, has neither) — the
frontend must handle `null` rather than assuming every module has them.

## Module Federation (frontend composing another module's UI inline)

`src/lib/remoteComponents.tsx`'s `loadRemoteComponent(module, exposedName)`
registers a module as a runtime remote (`registerRemotes`, idempotent)
and loads one exposed component (`loadRemote`) from `@module-federation/
runtime`. `vite.config.ts` declares `shared: { react, 'react-dom' }` as
singletons - **this must match the remote's own shared config exactly**
(same packages, `singleton: true`, compatible `requiredVersion` ranges)
or you get two React instances loaded and a genuinely confusing "invalid
hook call" crash from inside the remote's own component, not this repo's
code. If you add a new shared dependency here, add it to every remote's
`vite.config.ts` too.

A remote must be built (`vite build`), not served via `vite dev` — Vite's
dev server has no bundling step to emit a `remoteEntry.js` from. This
repo's own frontend (the host) stays on `vite dev` fine; it's only the
remote side (`platform-auth`, etc.) that needs `vite build --watch` +
`vite preview` instead — see root `docker-compose.yml`.

## Design system (`src/components/`)

Every reusable UI piece this package exports — `AppShell`, `Table`,
`Checkbox`, everything below — lives under `src/components/`, atomic-
design style (`atoms/` → `molecules/` → `organisms/` → `templates/`,
each level only importing from levels below it — `components/types.tsx`
holds the shared prop types every level imports from). `src/App.tsx`/
`main.tsx`/`pages/` next to it are this repo's OWN Module Federation
shell (see above), unrelated.

`src/containers/` sits next to `components/` for the layer above it -
stateful, feature-level compositions (owns state/effects/data-fetching,
wires several `components/` pieces into one real feature) as opposed to
`components/`'s pure presentation. Empty so far; same folder-per-piece +
barrel + colocated test convention below once something lands there.

**One folder per component**: `components/<level>/<Name>/` holds
`<Name>.tsx` (the implementation), `index.ts` (a barrel: `export {
default } from "./<Name>"; export * from "./<Name>";` — `Table`, which
has no default export, is just `export * from "./Table"`), and
`<Name>.test.tsx` (Vitest + Testing Library, colocated rather than in a
parallel `__tests__` tree). A sibling still imports the file directly
(e.g. `organisms/Sidebar/Sidebar.tsx` does `import Brand from
"../../atoms/Brand"`) — that path resolves to the folder's `index.ts`
same as it would from outside the package, so moving a flat `X.tsx` into
`X/X.tsx` never touches any OTHER file's imports, only `X.tsx`'s own
(everything it imports is now one directory deeper, so every `../` in
it gains one more `../`).

**Two barrels, not one**: `components/index.ts` re-exports every
component by name (the whole design system, one place); `src/index.ts`
(the actual package entry point `apps/main` imports) is just `export *
from "./components"`. A component never imports through either barrel
itself — only straight to the sibling file it needs — since
`components/index.ts` importing, say, `organisms/Sidebar`, which
imports `atoms/Brand`, which imported BACK through the barrel would be
a real import cycle the moment two components reference each other.

**Running the tests**: `npm test` (`vitest run`) / `npm run test:watch`.
`vitest.config.ts` is deliberately its own file, not a `test` block
added to `vite.config.ts` — that file configures the Module Federation
host app (federation plugin, `chrome89` build target), neither of which
component tests need. `src/vitest.d.ts` (`/// <reference types=
"@testing-library/jest-dom/vitest" />`) is what makes matchers like
`.toBeInTheDocument()`/`.toHaveClass()` type-check — TS project
references build each `tsconfig.*.json` as its own isolated program, so
a module augmentation only takes effect inside whichever program
actually includes the file that declares it; `vitest.setup.ts` (which
does the equivalent *runtime* import) lives outside `src/` entirely,
under `tsconfig.node.json`'s program, so it doesn't reach `src/**/*
.test.tsx`'s program at all - hence the separate ambient `.d.ts` inside
`src/`. **`vitest.config.ts`'s `plugins: react() as unknown as
Plugin[]` cast is load-bearing, not stylistic**: installed Vitest 3's
peer range tops out at vite `^7`, one major behind this repo's vite 8,
so npm resolves a second, nested vite copy just for Vitest - `defineConfig`
from `vitest/config` then type-checks `plugins` against THAT copy's
`Plugin` type, which `@vitejs/plugin-react` (built against the
top-level vite 8) doesn't structurally satisfy, even though both copies
agree on the actual plugin shape at runtime. Remove the cast once
Vitest publishes a release with vite 8 in its peer range - a plain
`plugins: [react()]` failing to type-check again is the signal that
day's arrived.

Absorbed from the former `platform-ui` module — that repo was frontend-
only (no backend, no models), so it had nothing else to justify its own
git submodule once this platform's convention became "packaged frontend
+ Django app together" per module. Same "frontend npm package, main
imports it" rule as `platform-auth`/`platform-org`'s frontend halves
(see root `AGENTS.md`), just living inside this repo's `frontend/`
alongside the Module Federation shell above rather than in its own repo
— the two don't share code, they just happen to be packaged together
now.

### Button (`components/atoms/Button/Button.tsx`)

Tabler's `.btn` family - `variant` (`primary`/`secondary`/`success`/
`danger`/`warning`/`info`/`light`/`dark`/`link`), `outline` (solid vs
`.btn-outline-{variant}`), `size` (`@default "sm"` - this design system
stays compact throughout, `Table`/`Pagination`/`ColumnPicker` were all
already hand-writing `.btn-sm`), and `icon` (`.btn-icon`, square). Every
raw `<button className="btn ...">` in `containers/` routes through this
now (`CrudCreateScreen`'s Create, `CrudEditScreen`'s Save/Delete,
`CrudListScreen`'s row Delete, `ColumnPicker`'s trigger and move-up/
down) - a hand-rolled `className` string per button was drifting (some
`btn-sm`, some not) before this existed.

**`variant` has no default - unset renders Tabler's own plain,
colorless `.btn`**, not a silently-chosen color. That's not a gap, it's
correct: `ColumnPicker`'s move-up/down buttons genuinely want the plain
neutral `.btn` Tabler ships when no color modifier is added, same as
they did before this component existed - defaulting `variant` to e.g.
`"primary"` would have turned those blue by accident. Every colored use
(a submit button, a destructive action) states its color explicitly.

**`type` defaults to `"button"`, not the native `"submit"`** - a plain
action button (e.g. a row's own Delete, sitting inside the same `<form>`
as the Create/Save submit button) that forgot to say `type="button"`
would otherwise silently submit the form on click. A real submit button
still passes `type="submit"` itself; nothing here changes that.

### AppShell (`components/templates/DashboardLayout`)

Pure presentation: sidemenu + sticky header, built from Tabler's own
vertical-navbar page layout. Zero react-router dependency of its own
(every level that renders a link takes a `linkComponent` prop instead of
calling a router hook) and zero auth-state of its own (`user`/`onLogout`
are passed in) — same conventions as this platform's other module
frontends. See `apps/main/frontend/app/routes/app-shell.tsx` for the
reference consumer.

**Collapsible groups**: a `navItems` entry with `children` (`NavGroup`)
renders as `SidebarNavGroup` - Tabler's own sidebar dropdown markup
(`.nav-item.dropdown` > `.dropdown-toggle` + `.dropdown-menu`), opened
by React state, not Bootstrap's dropdown JS. Expanded sidebar: toggles
inline, and closed groups are remembered per browser
(`platform-core:sidebar-closed-groups`, labels; read after mount like the
fold, `platform-core:sidebar-folded`). Folded rail: Tabler's flyout on
hover/focus only, never remembered - a flyout left open would cover the
page. A group's label is its storage key, so renaming one reopens it.

**`Header` must never carry a `navbar-expand-*` class** — Tabler's CSS
treats any `.page` child matching `[class*=navbar-expand]` that isn't
`.navbar-vertical` as "the other navigation" and hides one of the two
navbars depending on `data-bs-navbar-position`; an earlier version of
`Header` had `navbar-expand-md` leftover from copying Tabler's
single-navbar sample, which made `Sidebar` invisible unconditionally at
every viewport width, not just mobile (the element still reports
`position: fixed` from `getComputedStyle` even while `display:none`,
which is what made an earlier check wrongly conclude only mobile was
broken). Keep checking this if you ever add a class to `Header`.

**The sidebar's mobile toggler needs Bootstrap's JS** (`data-bs-toggle=
"collapse"`) — inert without it. The host loads Tabler's JS bundle (see
`apps/main/frontend/app/root.tsx`'s `<script>` tag), same "host loads
the design system" convention as Tabler's CSS.

**Folding the sidebar (desktop, lg+)** uses Tabler's own
`.navbar-folded` class on `Sidebar`'s `<aside>`: Tabler's CSS narrows it
to a 4rem icon rail and re-offsets the header and `.page-wrapper` through
`--tblr-sidebar-width`, so there's no layout CSS here. `AppShell` owns
the state and puts a toggle at the start of `Header`, hidden below lg,
where the usual collapsible top bar applies. The choice is remembered
in localStorage (`platform-core:sidebar-folded`), read after mount to
avoid a hydration mismatch, and a storage failure just means it isn't
remembered. The toggle is React-controlled on purpose; don't add
Tabler's `data-bs-toggle="sidebar-folded"`, which its JS bundle would
also act on (double toggle). When folded, nav titles are hidden, so each
item shows its `NavItem.icon` (or its first letter if it has none), and
the label becomes a `title` tooltip. Hosts should give every item an
icon; `apps/main`'s are in `app/lib/navIcons.tsx`.

**Sidebar width** is `AppShell`'s `sidebarWidth` prop (default `13rem`,
narrower than Tabler's own 16rem): set as `--tblr-sidebar-width` on
`.page`, which Tabler's CSS uses for the sidebar, the header and the page
offset alike - no layout CSS here. Folding still wins, since Tabler sets
the folded width directly on the sidebar and its siblings.

**`page-body` wraps `children` in a `.container-fluid`** (and `Header`
uses one too, so they line up) — Tabler's `.page-body` only ever adds
vertical padding; the horizontal gutter comes from the container being
an explicit child, which Tabler leaves to the page rather than baking
into `.page-body` itself. Fluid on purpose: content spans the full width
beside the sidebar, no max-width (it was `.container-xl`, capped at
1320px, until that left wide screens mostly empty). Missing the
container entirely looked like "the whole app has no left/right
padding," not obviously a missing class one level up.

### Modal (`components/organisms/Modal/Modal.tsx`)

Tabler's modal markup rendered by React, with open/closed as plain host
state (`open`/`onClose`). It deliberately doesn't use Bootstrap's modal
JS. It's portaled to `document.body`. Escape, the close button and a
backdrop click (only when the press started on the backdrop) all call
`onClose`. The page behind stops scrolling (`body.modal-open`). Focus
moves in (a child's `autoFocus` wins) and returns to the opener on
close. The opener is read during the render that opens the modal, since
by the time an effect runs, `autoFocus` has already moved focus. There's
no full focus trap yet. To put a form's submit button in `footer`, give
the button the native `form="<form id>"` attribute.

### Drawer (`components/organisms/Drawer/Drawer.tsx`)

Tabler's offcanvas, same rules as `Modal`: React-controlled
(`open`/`onClose`, no Bootstrap JS), portaled, Escape / close button /
backdrop close it, page scroll locked, focus in and back. `placement`
(`end` default, or `start`) and `width` (default `40rem`, capped at the
viewport). A `Modal` opened inside it stacks above it, and Escape closes
only that modal: the drawer ignores Escape while `body.modal-open` is
set. goalnexa's dashboard uses it to show `CrudDetailScreen`; `"."` also
exports `useResourcePath` for a host route like that one.

### Breadcrumb (`components/organisms/Breadcrumb/Breadcrumb.tsx`)

Tabler's `.breadcrumb` (docs.tabler.io/ui/components/breadcrumb) -
`items: BreadcrumbItem[]` (`label`, optional `icon`, optional `to`),
`separator` (`dots`/`arrows`/`bullets` - Tabler's default is a plain
slash, drawn in CSS either way, never typed into the DOM since a
literal separator character would be read out between every item by a
screen reader), `muted`. Zero react-router dependency of its own, same
`linkComponent` convention as `Sidebar`/`Brand`.

**The LAST item is always the current page, whether or not it has a
`to`** - Tabler's own accessibility note is explicit that the current
page "should not be a link," and a breadcrumb only ever has one current
page, always the trail's end. Renders as a plain `<li aria-current=
"page">`, never a link, even if the caller accidentally passed `to` on
it.

### Card (`components/organisms/Card/Card.tsx`)

Tabler's `.card` family (docs.tabler.io/ui/components/cards), composable
the same way as `Table` - `Card`/`CardHeader`/`CardTitle`/
`CardSubtitle`/`CardImage`/`CardBody`/`CardFooter` all live in one file
(same "a compound family stays together, not one file per sub-piece"
precedent `Table`/`TableHead`/`TableRow`/etc. set), assembled the same
shape as the plain HTML (`<Card><CardHeader><CardTitle>...`).
`CardTitle`'s `as` prop (`@default "h3"`, matching Tabler's own docs'
most common example) is the only real decision any of these make -
everything else is a 1:1 class-name mapping, no owned state.

### Table (`components/organisms/Table/Table.tsx`)

Composable pieces over Tabler's `.table` family (docs.tabler.io/ui/
components/table) — `Table`/`TableHead`/`TableBody`/`TableRow`/
`TableHeaderCell`/`TableCell`, assembled the same shape as a plain HTML
table (`<Table><TableHead>...<TableBody>...`). Each just renders the
class name/attribute a `Table` prop (`vcenter`/`nowrap`/`borderless`/
`center`/`transparent`/`responsive`/`selectable`/`mobileBreakpoint`) or
cell prop (`variant`, `sort`/`onSort`/`sortKey`, `label`, `truncate`)
maps to — same "props in, no owned state" rule as `AppShell`: sort order
and row selection are the CALLER's state (a `sort`/`onSort` pair per
`TableHeaderCell`, a controlled `components/atoms/Checkbox` with
`tableSelect` per row), these components never decide what "sorted" or
"selected" means, only how it's styled.
`components/atoms/Checkbox/Checkbox.tsx` (`tableSelect` prop →
`.table-selectable-check`) is what pairs with `Table`'s `selectable`
prop — Tabler's selected-row highlight is pure
CSS, no JS needed once that class is on the checkbox.

### Form / Fieldset (`components/{atoms,molecules,organisms}/Form*`, `Fieldset`)

Tabler's form primitives (docs.tabler.io/ui/forms/fieldset) as separate
pieces, not one do-everything `Form` component - a caller composes them
the same way they'd write the plain HTML: `FormLabel` (`.form-label`,
`required` prop → `.required`, same convention `FormCheck`'s label and
`Table`'s sortable header share for "the caller says what's required/
sorted, the component only renders the class"), `FormControl` (a plain
`<input class="form-control">` - every native `input` prop, ONE
component instead of one per `type`, since Tabler styles `text`/
`email`/`tel`/... identically and React's own `type` prop already picks
the right one, `size` `@default "sm"` same as `Button` - this design
system stays compact throughout, so every `FormControl` everywhere
(search boxes, CRUD form fields) is small unless a caller opts into
`"md"`/`"lg"`; named `size` like `Button`'s, not the
native HTML `size` attribute, which is omitted here since the two would
collide on the same prop name), `FormCheck` (`.form-check` - a checkbox
OR radio, `type` prop defaults to `"checkbox"`, and its `label` renders
inside the SAME `<label>` as the input so clicking the text toggles it
too), and `Fieldset` (`.form-fieldset` + a `legend` - see below).

**`Fieldset`'s `legend` prop is required for a reason, not just typed
that way**: docs.tabler.io/ui/forms/fieldset is explicit that a
`fieldset` with no `legend` (or a heading placed above a plain `div`
instead) LOOKS grouped but isn't connected to its fields for a screen
reader - there is no legitimate `Fieldset` usage without one, so the
component doesn't offer the option. It's the only correct way to group
a set of `FormCheck` radios/checkboxes that all answer one question
(share a `name` for radios); don't reach for it around a handful of
unrelated text fields just to draw a box - use a plain `div` (a
`Fieldset` with no real name is noise for a screen reader, same
complaint as a missing `legend`).

**`disabled` vs `readonly`**: `Fieldset`'s `disabled` prop (forwarded
straight to the native `fieldset` element) takes every control inside
out of the tab order AND out of the submitted form data at once - that
second part is what makes it wrong for "show this value but don't let
it be edited" (the value silently stops submitting). Put `readOnly` on
the individual `FormControl` instead when the value should still be
sent.

### Pagination (`components/organisms/Pagination/Pagination.tsx`)

Bootstrap/Tabler's `.pagination` nav markup, `<button>`s instead of
`<a href="#">`s - this is JS-driven (`onPageChange`), not real hrefs a
host's router should ever see, so a `button` gets the right disabled/
keyboard/focus behavior for free instead of needing `preventDefault`
plus manual `aria-disabled`. `page`/`pageCount` are the CALLER's state,
same rule as everything else in `components/`. The page-size `<select>`
is optional and all-or-nothing - `pageSize`/`pageSizeOptions`/
`onPageSizeChange` are only rendered together, since a size select with
nothing wired to change it (or vice versa) isn't a real option, just a
partially-built one. `containers/DataTable` is the reference consumer.

## Containers (`src/containers/`)

The layer above `components/` - stateful, feature-level compositions.
Where `components/` owns no state and does no data-fetching (every
piece there takes everything as props), a container OWNS state/effects
and wires several `components/` pieces into one real feature. Same
folder-per-piece + barrel + colocated test convention as `components/`
(see its own section above); `containers/index.ts` re-exports every
container the same way `components/index.ts` does, and `src/index.ts`
re-exports both barrels.

### DataTable (`containers/DataTable/`)

A real, fetched, paginated, sortable, searchable list from one
`DataTableConfig` - `Table`/`Pagination`/`FormControl`/`FormCheck` (all
`components/`) wired to a `useDataTable` hook that owns page/pageSize/
sort/search/column-visibility/column-order state and the one effect
that refetches when any of it changes. Same `lib/` + one-folder-per-piece
split as `CrudRouter` (see its own section) - this one grew a
`ColumnPicker` the same way that one grew `CrudFormFields`:

- `lib/` - `types.ts` (`DataTableColumn<T>` - a column's `key` doubles
  as its `?sort=` field name and its stacked-mobile `data-label`, unless
  overridden per-feature via `sortKey` - and `DataTableConfig<T>`:
  `endpoint`, `columns`, `rowKey`, plus an overridable `fetcher`,
  defaults to plain `fetch(url).then(r => r.json())`, override for auth
  headers or a non-`fetch` client). Had a per-column `filterable`/
  `filterLookup` (`?filter{field}=`) feature too, until it was removed
  wholesale - see below.
  `query.ts` - `buildDataTableUrl` (state -> URL) and the sort-cycling
  helpers, as PURE functions with no React in them at all - this is
  where the server contract actually lives, so it's the thing tested in
  isolation, independent of any rendering. `useDataTable.ts` - the
  state machine, independently testable via `renderHook` with no table
  mounted.
- `ColumnPicker/` - the "Columns" button + its show/hide/reorder
  dropdown, own folder (`ColumnPicker.tsx`/`index.ts`/
  `ColumnPicker.test.tsx`) since it's a real, independently-testable
  piece of UI, not a one-off inline block. Owns only its open/closed
  flag; which columns are hidden/in what order is still
  `useDataTable`'s state, passed in as props and reported back through
  `onToggleColumn`/`onMoveColumn` - same rule as everything else here.
- `DataTable.tsx` (container root, alongside `index.ts`) - renders the
  hook's state with `Table`/`ColumnPicker`/`Pagination`; owns no state
  of its own at all now that `ColumnPicker`'s open/closed flag moved
  with it.

**Two ways to use it - `config` (owns its own `useDataTable`) or `table`
(a `useDataTable` instance the CALLER already owns)**, mutually
exclusive via a discriminated union on `DataTableProps`. The `table`
form exists for `CrudListScreen`, which owns this card's ENTIRE chrome -
search + `ColumnPicker` in `CardHeader`, `Pagination` in `CardFooter`
(Tabler's own "toolbar in the header, table full-bleed below" card shape
- see its own section below) - and needs every piece reading/writing the
SAME state this component renders, not independent `useDataTable`
instances silently drifting out of sync. Passing `table` also switches
rendering to BARE mode: no toolbar, no `Pagination`, just the `<Table>`
itself (plus loading/error/no-results, which are data-dependent content,
not chrome) - the assumption is that a caller lifting the hook this way
is already taking over that chrome. `config` mode stays fully self-
contained (bundled toolbar + table + pagination) for a simpler consumer
that doesn't want a `Card` at all. `useDataTable` can't be called
conditionally on which prop was passed (rules of hooks), so the dispatch
is two tiny components (`DataTableWithOwnState` calls the hook,
`DataTableView` just renders a `DataTableState`, taking a `bare` flag),
not an `if` inside one.

**`useDataTable` exposes a real `refetch()`** - the "revisit if a second
consumer wants a manual refetch" this repo's own history predicted:
`CrudListScreen` used to force a refresh after a delete by remounting
`<DataTable key={refreshNonce}>`, which only worked because it owned no
state of its own; once it started calling `useDataTable` itself (to
share state with the header's search box, above), remounting `DataTable`
no longer resets ITS OWN hook call. `refetch` just bumps an internal
nonce that's in the fetch effect's dependency array but NOT in the built
URL, so it forces exactly one more fetch of the current page/sort/
search, nothing else.

**Filters**: `useDataTable`'s `filters`/`setFilters` are extra query
param pairs appended as is (back to page 1 on change). `CrudListScreen`
fills them from its "Filter" button: `CrudFilterModal` adds conditions
one field at a time, each with operators and a value input picked by
the field's schema type (`lib/filters.ts`'s `operatorsFor` - text
contains/is, number and date comparisons, choice/relation/boolean
selects, "is empty" on nullable fields and optional relations; a
datetime filters by whole local days). Conditions AND together, become
`core_api.filters`' `?filter{[-]field[.lookup]}=` params, and show as
removable chips under the header. Not kept in the URL or across visits.

**Matches `core_api`'s list-endpoint contract exactly, not a generic
"call any API" client**: `?page=`/`?page_size=` (`EnvelopePageNumberPagination`),
`?sort=`/`-field` (`SortParamOrderingFilter`), `?q=` (`QParamSearchFilter`)
- see `platform-core/backend/core_api/pagination.py`/`filters.py`'s
`SortParamOrderingFilter`/`QParamSearchFilter`. Point `endpoint` at any
`BaseViewSet`-backed list route on any module and it works with zero
server-side glue; it will NOT work against an endpoint using DRF's own
default `?ordering=`/`?search=`/pagination shape.

**Per-column filtering (`filterable`/`filterLookup`, a filter-row
`<input>` under each filterable column's header, `?filter{field}=`) was
removed wholesale, not just disabled for one module** - it existed
across `DataTableColumn`, `useDataTable`'s `filters` state/`setFilter`,
`buildDataTableUrl`'s `?filter{}=` building, and the filter-row rendering
in `DataTable.tsx`, and every one of those is gone now, not left dormant
behind a flag. `core_api.filters.DynamicFilterBackend`'s own `?filter{}=`
support is UNRELATED and still very much alive (any `BaseViewSet` still
accepts it directly, e.g. via a URL a caller builds by hand) - this was
specifically `DataTable`'s own UI for it, which nothing here uses
anymore. Re-add from scratch (rather than un-deleting) if a future
module genuinely needs per-column filtering again - re-implementing a
demonstrated, unwanted-until-now feature is cheaper than carrying its
weight (type surface, tests, docs) indefinitely on the chance it returns.

**`defaultPageSize` defaults to `25`, independent of `pageSizeOptions`**
- matches `EnvelopePageNumberPagination.page_size`'s own server-side
default. This hook always sends `?page_size=` explicitly (never omits
it to fall back to the server's default), so picking anything other
than 25 would make an unconfigured `DataTable` request a different page
size than every other client of the same endpoint - a real bug caught
by its own tests expecting `page_size=25` and getting `page_size=10`
(`pageSizeOptions[0]`) instead.

**The `useDataTable` fetch effect's `oxlint-disable-next-line
react/set-state-in-effect`s are intentional, not suppressed noise**:
the rule's own hint says effects should synchronize with external
systems, which is exactly what a fetch is - `setLoading(true)`/
`setError(null)` reset synchronously at the start of every refetch (not
just the first) because skipping that reset would leave a stale error
(or a stale "not loading") on screen for the whole round-trip after a
page/sort/search change.

**Column show/hide/reorder has no drag-and-drop** - move-up/move-down
buttons in the column picker instead, deliberately, to avoid pulling in
a DnD dependency (`dnd-kit`, etc.) this repo has never needed before for
one feature. Revisit if a second consumer actually wants dragging.

**`ColumnPicker`'s trigger is icon-only** (`aria-label="Columns"`, a
small inline SVG - not a new icon-library dependency, same "plain
Unicode/hand-drawn glyph over pulling in a package" call the move-up/
down buttons' `↑`/`↓` already made) - the visible "Columns" text label
was dropped once the button started sharing a `Card`'s header row with
other controls. `aria-label` carries the accessible name now that
there's no visible text to derive it from; don't drop that if you ever
touch this button again.

### CrudRouter (`containers/CrudRouter/`)

**Fully schema-driven now - a resource needs zero hand-written frontend
config.** `CrudListScreen`/`CrudCreateScreen`/`CrudEditScreen` each take
just `baseUrl`/`accessToken` (plus routing-agnostic callbacks -
`onDeleted`/`onCreated`/`onUpdated`, `id` for Edit) and build their own
`BaseApi<T>` internally (`useMemo`, `createBaseApi(baseUrl,
createRequest(accessToken))`). Every screen loads that resource's OWN
`GET <baseUrl>/schema` (`core_api.viewsets.BaseViewSet.schema` - see
this repo's own backend AGENTS.md-equivalent section) FIRST, then
derives columns (`createSchemaColumns`) or form fields
(`createSchemaFields`) from it, THEN loads the list/record. There is no
more hand-written `CrudConfig`/`columns`/`fields` array anywhere in this
platform - a module adding a new `BaseViewSet`-backed resource gets a
full list/create/edit UI for free, from the backend's own schema alone.
(`CrudConfig`/`CrudApi`/`createDefaultCrudApi` existed briefly during
this migration and were deleted once nothing read them anymore - don't
resurrect that shape.)

**Why schema-first, not parallel with the list/record fetch**:
`useDataTable`'s `columnOrder`/`hiddenColumns` state is a LAZY `useState`
initializer, computed ONCE from `columns` at mount - a `columns` array
that changed on a later render (once an async schema fetch resolved)
would leave that initial state stale, silently hiding/misordering
columns that didn't exist the first time. Every screen is split into an
OUTER component (owns only the schema fetch, renders "Loading…"/an error
until it resolves) and an INNER one (`CrudListScreenTable`/
`CrudCreateForm`/`CrudEditForm`, mounted only once schema is ready, so
`useDataTable`/`useCrudForm` are each called exactly once with their
FINAL shape from the start) - see `CrudListScreen.tsx`'s own docstring
for the fullest version of this reasoning.

Known gaps in the schema-driven mapping, left as documented gaps rather
than solved: a relation field (`type: "relation"` in the schema) has no
lookup UI - a list column shows the bare related id, and a form field is
a plain text input expecting that id typed in, not a `select` built from
the related resource's own rows (that needs a SECOND fetch this generic
code has no way to know it should make). A `date`/`datetime` schema
field also has no dedicated `CrudField` type yet - falls back to plain
text. See `schemaColumns.ts`/`schemaFields.ts`'s own docstrings.

Two subfolders, split by concern rather than left flat:

- `lib/` - everything that isn't itself a screen or a route file.
  `schema.ts` - `Schema`/`SchemaField`, the shape `BaseViewSet.schema`
  returns. `baseApi.ts` - `BaseApi<T>`/`createBaseApi` (schema/list/read/
  create/update/remove, mirroring the backend resource 1:1) and
  `BaseApiRequest` (a caller's own authenticated-fetch-and-parse
  function - this platform's `apiFetch` convention). `request.ts` -
  `createRequest(accessToken)`, the one concrete `BaseApiRequest` this
  platform ships (axios-backed under the hood, but the NAME stays
  transport-neutral on purpose - a caller shouldn't have to know or care
  which HTTP client built the one it got). `schemaColumns.ts`/
  `schemaFields.ts` - `Schema` -> `DataTableColumn<T>[]`/`CrudField<T>[]`
  (list columns / form fields respectively - see their own docstrings
  for exactly what's included/excluded and why). `types.ts` -
  `CrudField<T>` itself (what `CrudFormFields` actually renders one of),
  now just the OUTPUT shape `schemaFields.ts` builds, not a hand-written
  input anymore. `paths.ts` - `createCrudPaths(resource)`, computed from
  a resource's own name (see its own docstring for how this compares to
  `platform-auth-frontend`'s static `BASE_PATH`). `routes.ts` -
  `createCrudRoutes`/`prefixRoutes`/`routeFilePath`, see below -
  exported from `"."` like everything else, browser-safe on purpose
  (see its own docstring). `useCrudForm.ts` / `fields.ts` - the Create/Edit
  screens' shared form state and `pickFieldValues` (strips a submit
  payload down to exactly the field list schemaFields.ts built - without
  it, `CrudEditScreen`'s form, prefilled wholesale from `api.read`'s
  full record, would submit every extra property - `id`, timestamps,
  computed fields - right back to `api.update`; a real bug this
  container's own tests caught). `pickFieldValues` lives in its OWN file
  (`fields.ts`), not alongside `CrudFormFields.tsx` where it started - a
  plain function exported next to a component breaks
  `react/only-export-components`'s fast-refresh assumption (caught by
  this repo's own `oxlint` config).
- `screens/` - one folder per screen, same folder-per-component + barrel
  + colocated test convention as `components/` (`<Name>/<Name>.tsx` +
  `index.ts` + `<Name>.test.tsx`): `CrudListScreen`, `CrudCreateScreen`,
  `CrudEditScreen` (each internally split into an outer schema-loading
  component and an inner table/form component - see above), and
  `CrudFormFields` (one `FormLabel`+`FormControl`, or `FormCheck` for a
  `checkbox` field, or a native `<select>` for `type: "select"`, per
  `CrudField` - not re-exported from `CrudRouter/index.ts`, an
  implementation detail of Create/Edit, not a `components/` design-
  system piece on its own).

**`createCrudRouter(baseUrl)` (client-safe, the `"."` export) binds
`baseUrl` into `List`/`Create`/`Edit` once**, so a caller never passes it
again - `{ paths, List, Create, Edit }` (`CrudRouter.ts`). A domain
module's own screen-wrapper package (e.g. `platform-org-frontend`) has
ONE `lib/<x>Router.ts` per resource (`export const OrgsRouter =
createCrudRouter<Organization>("/api/v1/orgs")`), and its own
`<x>Paths.ts`/screen files just re-export `.paths`/`.List`/`.Create`/
`.Edit` - see `platform-org-frontend`'s own `lib/orgsRouter.ts` for the
reference shape. Every frontend package in this platform is router-
agnostic on purpose (root `AGENTS.md`'s "no react-router dependency of
its own" rule) - `createCrudRouter`'s OWN return value is plain
component references, never an actual `<Routes>`/`<Route>` tree.
`CrudEditScreen` takes `id` as a plain prop rather than reading a router
param itself - same rule every screen in this platform follows for
routing-dependent values.

**`createCrudRoutes(apiPath)` (from the `"."` entry) is
the ACTUAL react-router wiring** - and it's the one place in this whole
platform where "no react-router dependency of its own" doesn't apply,
on purpose: it registers a resource's list/create/edit URLs against
THREE GENERIC route files this package itself ships
(`src/routes/crud-list.tsx`/`crud-new.tsx`/`crud-edit.tsx`) - the SAME
three files for every resource, not one set per domain module anymore,
since `CrudListScreen`/etc. are already fully generic (schema-driven, no
per-resource UI difference left to justify per-resource route files).
**Because they're shared, each one keys its screen by resource (and row)**
- `/goals` -> `/metrics` client-side reuses the same route element, and
`useDataTable`'s column state is computed once at mount, so without the
`key` the metrics list kept the goals columns and showed only the ones
both share (just `parent`: a list with "no columns"). A
host's `routes.ts` registers a whole resource with one call:
```ts
import { createCrudRoutes } from "platform-core";
...
layout("routes/app-shell.tsx", [
  ...createCrudRoutes("/api/v1/orgs"),
  ...createCrudRoutes("/api/v1/goals"),
]),
```
The generic route files derive WHICH resource they're rendering at
RENDER TIME, from the URL's own first path segment (`useLocation()`,
NOT a static import) - `/goals` -> resource `"goals"` -> `baseUrl
"/api/v1/goals"`, relying on this platform's own established "URL
segment always equals the backend resource name" convention (true for
every resource today; would need revisiting if that convention were
ever broken for one resource). Three things worth knowing if you touch
this:
- **`createCrudRoutes` must set an explicit `id` on each route
  entry** (`{ id: `crud-list-${resource}` }`, etc.) - react-router derives
  a route's `id` from its `file` by default, and since every resource
  points at the SAME file, omitting `id` collides ("Unable to define
  routes with duplicate route id", confirmed the hard way the moment a
  second resource was registered).
- **The generic route files' paths are computed from
  `import.meta.url`** (via `routeFilePath`, plain string ops), not a
  relative string baking in the CALLER's directory depth - this package
  only ever has to know where its OWN `src/routes/` folder is relative to
  ITSELF, regardless of which host imports `createCrudRoutes` or from
  where. A caller-supplied `dir` argument existed briefly during this
  migration (when route files were still per-domain-module) and was
  removed once centralizing them here made it unnecessary - don't
  reintroduce it.
- **`routes.ts` must stay browser-safe** - it's exported from `"."`,
  which IS client-bundled (`AppShell` gets pulled into every host's
  `app-shell.tsx`). So: plain route-config objects (`RouteEntry`), never
  `@react-router/dev/routes` (Node-only tooling - measured once at a
  real ~16KB client-bundle cost when it leaked into `"."`; `prefixRoutes`
  replicates its `prefix()`), no `node:*` imports, nothing computed at
  module load (paths are built only when a builder is CALLED - in Node,
  from the host's `routes.ts`), and never `new URL(rel,
  import.meta.url)` (Vite rewrites that into an asset reference). The
  builders tree-shake out of the client build. `routeFilePath`/
  `prefixRoutes` are exported for sibling packages' own builders
  (`platform-org-frontend`'s `createOrgsRoutes`). `crud-list.tsx`/etc.
  are the only files here importing `react-router` itself - real route
  MODULES that render UI.
- If you ever need a per-resource CUSTOM route module again
  (a resource whose UI genuinely differs from the generic screens),
  put it back in that domain module's own package, not here - see root
  `AGENTS.md`'s "A module with its own route modules" section.

**`CrudListScreen` calls `useDataTable` itself and passes the instance
to `<DataTable table={...}>`, rather than handing `DataTable` a `config`
and letting it own the hook** - it owns this card's whole chrome (New
link + search + `ColumnPicker` in `CardHeader`, `Pagination` in
`CardFooter`; `DataTable` itself renders BARE, no chrome of its own -
see `DataTable`'s own section for the `config`-vs-`table` split this
required), all of it reading/writing the SAME state. After a delete, it
calls the shared instance's `table.refetch()` to get the list back in
sync with the server - an earlier version forced this by remounting
`<DataTable key={refreshNonce}>`, which stopped being an option the
moment `CrudListScreen` started owning the hook (remounting `DataTable`
no longer resets a hook call that lives one level up).

**`CrudListScreen` calls `useDataTable` itself and passes the instance
to `<DataTable table={...}>`, rather than handing `DataTable` a `config`
and letting it own the hook** - it owns this card's whole chrome (New
link + search + `ColumnPicker` in `CardHeader`, `Pagination` in
`CardFooter`; `DataTable` itself renders BARE, no chrome of its own -
see `DataTable`'s own section for the `config`-vs-`table` split this
required), all of it reading/writing the SAME state. After a delete, it
calls the shared instance's `table.refetch()` to get the list back in
sync with the server - an earlier version forced this by remounting
`<DataTable key={refreshNonce}>`, which stopped being an option the
moment `CrudListScreen` started owning the hook (remounting `DataTable`
no longer resets a hook call that lives one level up).

**Every DATA cell in a row opens the edit screen, not just the "Edit"
link text** (the actions cell, deliberately, is the one exception - see
below) - via a per-CELL invisible decoy `Link` (`tabIndex={-1}`,
`aria-hidden`, `.stretched-link`, no visible content), not a synthetic
`onClick`-driven navigation: this platform's screens never navigate
imperatively (the "host owns routing" rule - see root `AGENTS.md`), and
`.stretched-link` gets the effect entirely through a real anchor - no
`navigate` call, no new dependency. The one visible, labeled "Edit" link
is still what keyboard/screen-reader users actually reach; the decoys
are `aria-hidden` and out of the tab order specifically so they don't
add N indistinguishable extra stops per row.

**Deliberately per-CELL, not one stretched-link spanning the whole
`<tr>`** - verified against a real browser (this whole feature is
exactly the kind of thing that passes every unit test and every
`tsc`/lint check while being silently broken, or silently breaking
something ELSE, in an actual page - nothing about it was trusted without
a real click in a real browser): `position: relative` on a `<tr>` does
not reliably act as the containing block for an absolutely-positioned
descendant in real browser engines, `<td>` does. It's also why the
VISIBLE "Edit" link can't just carry `.stretched-link` itself (the
simpler-looking fix, tried first, and wrong): `.btn` (which `Edit` needs
anyway, for the alignment fix below) sets `position: relative` on
itself, which becomes the `::after`'s containing block INSTEAD of the
`<td>` — same failure, one ancestor level closer, not obvious from
Bootstrap's own docs. The fix: `.stretched-link` lives on a SEPARATE,
unstyled decoy anchor per cell (`position: relative` only on the `<td>`,
never on the decoy itself).

**The ACTIONS cell (Edit/Delete) does NOT get a decoy, unlike every
other cell** - tried first, also verified against a real browser, also
wrong: "a later, `position`-having sibling paints over an earlier one's
`::after` overlay" (the rule that lets `Button`'s `.btn` sit correctly
above other things elsewhere in this design system) turned out NOT to
reliably hold for THIS specific case - a real click on Delete hit the
same-cell decoy underneath it instead of the button. Rather than fight
that stacking interaction further, the actions cell just has no decoy at
all: a small, mostly-full-of-controls cell, so losing "click blank space
here too" costs little next to Delete definitely still working.

**`LinkComponentProps` grew `tabIndex`/`aria-hidden` (and `children`
became optional) to support these decoys** - a small, deliberately
additive widening (every existing `LinkComponent` implementation across
this platform - `DefaultLink` here, `apps/main`'s `ShellLink`, the
`CrudLink` defined inside `crud-list.tsx` - needed a one-line `...rest`
spread added to actually forward them, otherwise the widened prop type
would type-check but silently do nothing). Grep for `LinkComponentProps`
across the platform if you add a new `LinkComponent` implementation -
matching this shape is what makes the decoy pattern (or any future use
of passthrough anchor attributes) work through it.

Edit and Delete also share the exact same `.btn.btn-link.btn-sm`
classes now (previously Edit was a bare, unstyled `<a>`, which put it
visibly out of alignment with Delete's `Button`-rendered `.btn`).

#### Adding a new resource's UI end-to-end - the whole cookbook

Given a `BaseViewSet`/`BaseSerializer`-backed backend resource already
exists (see the "`BaseSerializer`/`BaseViewSet`" section below) at, say,
`/api/v1/widgets`:

1. **Backend: nothing extra.** `GET /api/v1/widgets/schema` already
   works the moment the `BaseViewSet` subclass exists - `BaseViewSet`
   ships the `schema` action for free (`core_api/viewsets.py`).
2. **Frontend, in the domain module's own package** (e.g.
   `goalnexa-frontend`) - two tiny files, no hand-written config:
   ```ts
   // lib/widgetsRouter.ts
   import { createCrudRouter } from "platform-core";
   import type { Widget } from "./api/widgets";
   export const WidgetsRouter = createCrudRouter<Widget>("/api/v1/widgets");
   ```
   ```ts
   // lib/widgetsPaths.ts
   export const WIDGETS_PATHS = WidgetsRouter.paths;
   ```
   Export `WIDGETS_PATHS`/`WIDGETS_PATH`/`WIDGETS_NEW_PATH`/
   `widgetsEditPath` (`WIDGETS_PATHS.listPath`/`.createPath`/
   `.editPath`) from the package's own `index.ts` barrel, same as every
   other resource's `*_PATH` exports there - `apps/main`'s
   `app-shell.tsx` needs these for its nav item.
   **No screen wrapper files, no route files, no `CrudConfig` needed** -
   `WidgetsRouter.List`/`.Create`/`.Edit` ARE the screens; the actual
   route registration (step 3) points straight at platform-core's own
   generic route files, not anything in this package. Only build a
   custom screen file if this resource needs something a generic screen
   can't do - related rows are NOT that case anymore (see
   "Relationships" below).
3. **`apps/main/frontend/app/routes.ts`** - one line:
   ```ts
   ...createCrudRoutes("/api/v1/widgets"),
   ```
   inside the same `layout("routes/app-shell.tsx", [...])` array every
   other resource's call sits in.
4. **`apps/main/frontend/app/routes/app-shell.tsx`** - import
   `WIDGETS_PATH` from the domain package's barrel and add a `{ label:
   "Widgets", to: `/${WIDGETS_PATH}` }` entry to `NAV_ITEMS`.

That's the whole thing - list/create/edit, schema-derived columns and
form fields, search/sort/pagination, delete-with-confirm, all working,
zero per-resource UI code beyond the two one-liner files in step 2.
A to-one relation column shows the related row's `display_field`, not
its id: list tables (`CrudListScreen` and a detail page's relation tabs)
fetch with `?include[]=<to-one relations>` (`withRelationIncludes`), so
each such relation arrives as its nested row, and label it with the
related schema's `display_field` (`useRelatedDisplayFields`). A plain
uuid column with no model relation (e.g. `org_id`) still shows the id.

### Relationships - detail screen, 1-n CRUD, n-n link

`CrudDetailScreen` (`/<resource>/:id`, generic route `crud-detail.tsx`)
shows one record and manages its to-many relations - nothing per
resource, it's all from the schema.

**Backend** (`core_api/relations.py` + `BaseViewSet`):
- `schema` also describes the resource itself, so the UI never guesses
  from a URL or a row's shape: `label`/`label_plural` (the model's
  `verbose_name`/`verbose_name_plural` - set them on the model when the
  class name reads badly, e.g. `CheckIn` -> "check-in"), `display_field`
  (what names a row: `Meta.display_field` on the serializer, else the
  first model `CharField`, else the first plain field, else the pk) and
  `searchable` (the viewset has `search_fields`; search boxes are hidden
  otherwise). Per field: `format: "uuid"` (a UUID - opaque id, not human
  text: a read-only one is hidden on the detail page and hidden-by-default
  as a list column) and `multiline` (a `TextField`: `<textarea>` in forms,
  full-width block on the detail page).
- `schema` tags each to-many `DynamicRelationField` backed by a real
  model relation with `kind` (`one_to_many` = reverse FK,
  `many_to_many` = M2M either side) and `back_filter` - the lookup on
  `related_endpoint` pointing back (`?filter{goal}=<id>` lists a goal's
  metrics; `?filter{-goal}=<id>` the rest). `many_to_many` also gets
  `through_fields`: a custom through model's own editable, non-FK fields
  (empty for Django's auto through).
- `POST <res>/<id>/relations/<name>/link` `{ids, through?}` and
  `.../unlink` `{ids}` - M2M only (404 otherwise). Link resolves ids
  through the RELATED model's own `BaseViewSet` (`get_queryset()` +
  permissions, for the same request), so a caller can only link rows
  they could list themselves; any unknown id fails the whole request.
  `through` is validated by a `ModelSerializer` over `through_fields` and
  passed as `through_defaults`. `BaseViewSet.__init_subclass__`
  registers model -> viewset (`registry.model_viewset`) for this -
  automatic, no extra call. A related model with no `BaseViewSet` can't
  be linked (403).
- Tests: `backend/tests/` (a test-only app with shelf/book/tag/club
  models, one per relation shape) - `python manage.py test tests
  --settings=config.test_settings`.

**Frontend** (`containers/CrudRouter/screens/`):
- `CrudDetailScreen` - schema, then record. Tabler page header
  (breadcrumb back to the list, `label` pretitle, `display_field` title,
  Edit/Delete), then ONE full-width card whose tabs are "Details" (first,
  selected on load: a responsive grid of fields - `lib/format.ts`'s
  `formatFieldValue`, also used by list columns; choices/booleans as
  badges; the title field and read-only uuids left out) and one per
  relation with a row-count badge (`?filter{back}=<id>&page_size=1`,
  re-counted after a change) - so a relation's table gets the page's
  whole width. A to-one relation shows the related
  row's `display_field` (related schema via `lib/schemaCache.ts`'s
  `loadSchema`, cached per token + endpoint; row from
  `related_endpoint/<id>`) and links to its detail page wherever
  `resourcePath` says it's mounted. Tabs = relations with a `kind`.
- **Where another resource is mounted** comes from the host's route
  manifest, not a guess: `routes/useResourcePath.ts` finds the
  `crud-detail-<resource>` route id `createCrudRoutes` registers and joins
  its ancestors' paths (`/api/v1/orgs` -> `platform-org/orgs`); no such
  route -> `null` -> plain label, no link. Reads react-router's
  `UNSAFE_FrameworkContext` manifest, so the host MUST set
  `routeDiscovery: { mode: "initial" }` (lazy discovery only ships the
  routes matched so far - see `apps/main/frontend/react-router.config.ts`). A section change reloads the
  record (`onChanged`) since parents may show derived values
  (`Metric.current_value`).
- `CrudRelationSection` - spinner on the first fetch, then either an
  empty state ("No metrics yet" + the create/link actions) or a toolbar
  (search, columns, actions) over the table; row actions are icon buttons
  (`components/atoms/Icon` - inline Tabler icons, `aria-label` like
  "Edit Revenue"), same as `CrudListScreen`'s rows. It loads
  the related resource's own schema + a bare
  `DataTable` on `related_endpoint?filter{back}=<id>`; buttons named from
  the related schema's `label` ("New check-in"). `one_to_many`:
  New/Edit in `CrudFormModal` with the back FK hidden and preset on
  create (the owning ViewSet resolves it from the body, per this
  platform's convention), Delete. `many_to_many`: Link existing
  (`CrudLinkModal`: multi-select of unlinked rows labelled by the related
  `display_field`, first 20 matches, search only if `searchable`, plus
  through fields), New = create + link in one form
  (through fields prefixed `through__` to avoid name clashes), Unlink.
- `CrudFormModal` - schema-driven form in `Modal`; body mounts only
  while open (fresh state per open); `load` is read once on mount.

Known gaps: through values of existing links can't be edited (unlink +
relink, or manage the through model as its own resource - its reverse FK
shows as a `one_to_many` tab if it has a `BaseViewSet`); the generic
route files still derive their OWN API base URL from the URL's last
segment (`/api/v1/<resource>`); document titles (`meta`) still come from
the URL, since `meta` can't fetch the schema; a `one_to_many` child whose FK the owning ViewSet doesn't resolve from the
request body won't get its parent set.

## Single-port composition

The parent platform composes every module behind one nginx port
(`nginx/default.conf` in that platform's own repo), path-prefixed per
`modules.yaml`'s `url_prefix`. If you add a route here, it's reachable
both directly (`platform-core-backend:8000/api/...`) and through the
gateway (`<gateway>/api/...`, no rewriting needed since platform-core
itself has no prefix). A module WITH a prefix (like `platform-auth` at
`/platform-auth`) needs its own frontend served with a matching Vite
`base` and any absolute cookie paths built from an env-configured prefix
— see `platform-auth`'s `URL_PREFIX` setting for the pattern.

## History note

An earlier frontend (Tabler design system, generic admin CRUD surface,
login/signup/org pages) was deleted when the backend dropped its auth/
org/RBAC/CRUD-factory routes — the current `frontend/` is a from-scratch,
much smaller replacement (a router shell, not a UI), not a continuation
of that one.

## `BaseSerializer` / `BaseViewSet` - dynamic fields, sideloading, filtering

`core_api/serializers.py`/`viewsets.py`/`filters.py` add DRF base classes
inspired by django-rest-framework's `dynamic-rest` package - reimplemented
against this platform's own conventions (`?sort=`/`?q=` naming,
`EnvelopePageNumberPagination`) rather than vendored, since dynamic-rest
bakes in its own opinions on both of those. A module's own serializer/
viewset subclasses these instead of plain `ModelSerializer`/`ModelViewSet`
to get, for free:

- **Dynamic fields**: `?include[]=field`/`?exclude[]=field` control which
  declared fields serialize. List a field in `Meta.deferred_fields` to
  leave it out unless explicitly included - useful for anything expensive
  (a relation, a computed field) that most callers don't need.
- **Relation sideloading**: `DynamicRelationField(serializer_class,
  many=False)` wraps another `BaseSerializer` for a relation. Renders as
  a bare id (or list of ids) by default; naming the field in
  `?include[]=` swaps in the full nested representation instead.
  `serializer_class` accepts a zero-arg callable that does its own
  deferred import instead of the class directly - needed the moment two
  serializers reference each other (see `platform-org`'s `Organization`/
  `OrgMembership` serializers for the actual pattern: a plain lambda
  capturing a name from module scope reintroduces the circular-import
  deadlock a naive fix looks like it solves, since the OTHER module still
  needs a working name to capture *from* - a function that imports inside
  its own body, only ever called later at render time, is what actually
  breaks the cycle).
- **Filtering**: `?filter{field}=value` (exact), `?filter{field.lookup}=
  value` (`icontains`/`gt`/`gte`/`lt`/`lte`/`in`/`isnull`), a leading `-`
  on the field name negates. See `filters.py`'s own docstring for the
  field-vs-lookup-name ambiguity this accepts as a limitation. A filter
  the ORM can't apply (unknown field/lookup, a path through a plain
  field like `org_id.name`, a malformed uuid) is a **400 naming the
  filter key**, not a 500 - AI clients guess filters (platform-mcp hands
  them straight through), and a 400 is something they can recover from.
- `BaseViewSet.get_queryset()` auto-`prefetch_related`s any sideloaded
  `many=True` relation, so using `?include[]=` against a real dataset
  doesn't quietly turn into an N+1.

**Every process that installs this package must point its OWN
`REST_FRAMEWORK["EXCEPTION_HANDLER"]` at
`"core_api.exceptions.platform_exception_handler"`** - this is easy to
miss because each module's OWN `settings.py` (used only for its
standalone deployment) already has this right, but a HOST importing the
module (e.g. `apps/main`) has its own separate `settings.py` with its own
copy of this setting, which doesn't automatically follow along. Hit this
for real while building `BaseSerializer`/`BaseViewSet`: `apps/main`'s
`config/settings.py` had a copy-pasted `EXCEPTION_HANDLER` still pointing
at a module-specific handler name (`platform_auth_exception_handler`)
that got removed from this consolidation - every request that errored
then 500'd on `ImportError` INSIDE DRF's own exception handling, instead
of returning the error it was actually trying to report. Grep every
`settings.py` across the platform for `EXCEPTION_HANDLER` after touching
this file's exception handler name.

## Access policy (`core_api/access.py`) - authorization hook

`CORE_API_ACCESS_POLICY` (a dotted path, optional) names a class every
`BaseViewSet` consults on top of its own `permission_classes` and
`get_queryset()` scoping: `has_permission`, `has_object_permission`,
`filter_queryset`, `allows`. Unset = no change. Core knows no roles - an
authorization module implements it (platform-auth's RBAC; any project can
plug its own). What core guarantees, so a policy doesn't have to:
- the policy's filter runs for list and for every row lookup, and for
  the rows a many-to-many link may reach (`_scoped_queryset`);
- create/update re-check the SAVED row inside a transaction, rolled back
  on denial (`BaseViewSet.create`/`update` reimplement DRF's to do this -
  keep that in mind before overriding them);
- a bare cross-module id (`Meta.related_endpoints`, e.g. a goal's
  `org_id`) must, when set or changed, be a row the caller could list at
  that endpoint - else `400` on that field (`_check_cross_module_ids`;
  runs with or without a policy). Opt a field out with
  `Meta.unchecked_related_endpoints` when access to it is decided
  elsewhere (RBAC's `scope_id`). Endpoints no `BaseViewSet` serves in
  this host aren't checked;
- `visible_rows(endpoint, request)` (`core_api.viewsets`) is the same
  "rows the caller could list there" queryset, public - for a module that
  scopes by another module's rows without importing its models (goalnexa
  shares org goals with members through it);
- `scope_field` on a viewset (lookup path, e.g. `"goal__org_id"`) tells a
  policy where a row's scope lives; `resource_key(view)`/
  `action_verb(view)`/`scope_of(obj, path)` are the shared helpers.
The schema reports `can: {create, update, delete}` (method served AND
`policy.allows`); the generic screens (`canDo(schema, ...)`) and
platform-mcp's tool list hide what the caller can't use. The API still
enforces every call. Tests: `tests/test_access.py` (a header-driven
policy).

## MCP server - moved to platform-mcp

The MCP server over every `BaseViewSet` used to live here
(`core_api/mcp.py`). It's its own module now, `platform-mcp`, together
with the personal access tokens MCP clients authenticate with - see its
AGENTS.md. It still builds on this kernel's registry
(`core_api.registry`) and each resource's `schema` action, so a change
to either shape affects its tools. `mcp_enabled = False` on a viewset
still hides a resource from it (platform-mcp reads it with `getattr`;
nothing here declares it).

## Adding a shared convention

Only add something here if it's genuinely reusable with **zero model
coupling** — `core_api/` should stay a library other Django apps import
(error classes, a pagination class, uuid7, the dynamic serializer/viewset
base classes above), never grow entity-specific code. A new capability
(even something as central-feeling as orgs or RBAC) belongs in its own
module/repo, following `platform-auth`'s shape (own backend, own
frontend, own repo), not back in this kernel.

## Testing

`cd backend && python manage.py check` / `python manage.py runserver` —
no DB is required to boot (contenttypes/auth tables get created by
`migrate` but nothing queries them yet).

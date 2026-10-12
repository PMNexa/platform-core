/**
 * The whole design system, one barrel - every atom/molecule/organism/
 * template this package has, re-exported by name. `src/index.ts` (the
 * package entry point) is just `export * from "./components"`; anything
 * that needs several of these pieces (that entry point, a consuming app)
 * gets them all from this one import instead of one deep path per
 * component. A component inside this tree still imports a sibling
 * directly (e.g. `organisms/Sidebar` importing `atoms/Brand`), never
 * through this barrel - routing that through here would import the
 * whole design system just to reach one piece, and risks a cycle the
 * moment two components reference each other.
 */

export { default as Avatar } from "./atoms/Avatar";
export type { AvatarProps } from "./atoms/Avatar";

export { default as Brand } from "./atoms/Brand";
export type { BrandProps } from "./atoms/Brand";

export { default as Button } from "./atoms/Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./atoms/Button";

export { default as CopyButton } from "./atoms/CopyButton";
export type { CopyButtonProps } from "./atoms/CopyButton";

export { default as Checkbox } from "./atoms/Checkbox";
export type { CheckboxProps } from "./atoms/Checkbox";

export { default as Icon } from "./atoms/Icon";
export type { IconName, IconProps } from "./atoms/Icon";

export { default as FormLabel } from "./atoms/FormLabel";
export type { FormLabelProps } from "./atoms/FormLabel";

export { default as FormControl } from "./atoms/FormControl";
export type { FormControlProps } from "./atoms/FormControl";

export { default as FormSelect } from "./atoms/FormSelect";
export type { FormSelectProps, FormSelectSize } from "./atoms/FormSelect";

export { default as CodeBlock } from "./molecules/CodeBlock";
export type { CodeBlockProps } from "./molecules/CodeBlock";

export { default as FormCheck } from "./molecules/FormCheck";
export type { FormCheckProps } from "./molecules/FormCheck";

export { default as SegmentedControl } from "./molecules/SegmentedControl";
export type { SegmentedControlProps, SegmentedOption } from "./molecules/SegmentedControl";

export { default as SidebarNavItem } from "./molecules/SidebarNavItem";
export { default as SidebarNavGroup } from "./molecules/SidebarNavGroup";
export type { SidebarNavGroupProps } from "./molecules/SidebarNavGroup";
export type { SidebarNavItemProps } from "./molecules/SidebarNavItem";

export { default as UserSummary } from "./molecules/UserSummary";
export type { UserSummaryProps } from "./molecules/UserSummary";

export { default as UserMenu } from "./molecules/UserMenu";
export type { UserMenuProps } from "./molecules/UserMenu";

export * from "./organisms/Breadcrumb";

export * from "./organisms/Card";

export { default as Fieldset } from "./organisms/Fieldset";
export type { FieldsetProps } from "./organisms/Fieldset";

export { default as Header } from "./organisms/Header";
export type { HeaderProps } from "./organisms/Header";

export { default as Pagination } from "./organisms/Pagination";
export type { PaginationProps } from "./organisms/Pagination";

export { default as Sidebar } from "./organisms/Sidebar";
export type { SidebarProps } from "./organisms/Sidebar";

export { default as Drawer } from "./organisms/Drawer";
export type { DrawerPlacement, DrawerProps } from "./organisms/Drawer";

export { default as Modal } from "./organisms/Modal";
export type { ModalProps, ModalSize } from "./organisms/Modal";

export * from "./organisms/Table";

export { default as AppShell } from "./templates/DashboardLayout";
export type { DashboardLayoutProps as AppShellProps } from "./templates/DashboardLayout";

export { DefaultLink } from "./types";
export type { AppShellUser, LinkComponent, LinkComponentProps, NavEntry, NavGroup, NavItem, UserMenuEntry } from "./types";
export { isNavGroup } from "./types";

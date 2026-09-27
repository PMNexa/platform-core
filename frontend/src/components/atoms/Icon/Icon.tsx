import type { ReactNode } from "react";

/* Tabler Icons (MIT, tabler.io/icons), inlined as paths - no icon font or package is loaded. */
const PATHS: Record<IconName, ReactNode> = {
  eye: (
    <>
      <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </>
  ),
  filter: <path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227z" />,
  x: (
    <>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </>
  ),
  link: (
    <>
      <path d="M9 15l6 -6" />
      <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" />
      <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />
    </>
  ),
  unlink: (
    <>
      <path d="M17 22v-2" />
      <path d="M9 15l6 -6" />
      <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" />
      <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />
      <path d="M20 17h2" />
      <path d="M2 7h2" />
      <path d="M7 2v2" />
    </>
  ),
};

export type IconName = "eye" | "pencil" | "trash" | "plus" | "filter" | "x" | "link" | "unlink";

export interface IconProps {
  name: IconName;
  /** Tabler's `.icon` sizes it to the surrounding text (and `.btn .icon` spaces it from a label). */
  className?: string;
}

/**
 * One Tabler icon as inline SVG, decorative (`aria-hidden`) - the control
 * it sits in carries the accessible name (visible text, or `aria-label`
 * on an icon-only button).
 */
function Icon({ name, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={["icon", className].filter(Boolean).join(" ")}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export default Icon;

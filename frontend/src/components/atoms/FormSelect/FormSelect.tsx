import type { SelectHTMLAttributes } from "react";

export type FormSelectSize = "sm" | "md" | "lg";

export interface FormSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** @default "sm" - compact like `FormControl` and `Button`; `"md"` is Tabler's plain `.form-select`. Named `size` like theirs, not the native HTML `size` attribute (visible rows), which is omitted. */
  size?: FormSelectSize;
}

/** A native `<select>` styled as Tabler's `.form-select` - pass `<option>`s as children. */
function FormSelect({ className, size = "sm", ...rest }: FormSelectProps) {
  const classes = ["form-select", size === "sm" && "form-select-sm", size === "lg" && "form-select-lg", className]
    .filter(Boolean)
    .join(" ");
  return <select className={classes} {...rest} />;
}

export default FormSelect;

import Button, { type ButtonSize, type ButtonVariant } from "../../atoms/Button";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  /** @default "primary" */
  variant?: ButtonVariant;
  /** @default "sm" - same as `Button`. */
  size?: ButtonSize;
  className?: string;
}

/**
 * A row of mutually exclusive choices (a mode switch) - `Button`s in a
 * Tabler `.btn-group`: the picked one solid, the rest outlined, each with
 * `aria-pressed`.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  variant = "primary",
  size = "sm",
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={["btn-group", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          variant={variant}
          outline={option.value !== value}
          size={size}
          aria-pressed={option.value === value}
          onClick={() => option.value !== value && onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export default SegmentedControl;

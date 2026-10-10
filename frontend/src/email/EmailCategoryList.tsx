import type { EmailCategoryChoice } from "./api";

export interface EmailCategoryListProps {
  categories: EmailCategoryChoice[];
  onToggle: (key: string, enabled: boolean) => void;
  disabled?: boolean;
  /** Marked as the one the email came under (the unsubscribe page). */
  highlight?: string;
}

/** One switch per email category, with what it covers. */
function EmailCategoryList({ categories, onToggle, disabled, highlight }: EmailCategoryListProps) {
  return (
    <div className="divide-y">
      {categories.map((category) => (
        <label key={category.key} className="row g-2 align-items-start py-2 m-0" style={{ cursor: "pointer" }}>
          <span className="col">
            <span className="fw-medium">{category.label}</span>
            {highlight === category.key && <span className="badge bg-azure-lt ms-2">This email</span>}
            {category.help && <span className="d-block small text-secondary">{category.help}</span>}
          </span>
          <span className="col-auto">
            <span className="form-check form-switch m-0">
              <input
                type="checkbox"
                className="form-check-input"
                role="switch"
                aria-label={category.label}
                checked={category.enabled}
                disabled={disabled}
                onChange={(event) => onToggle(category.key, event.target.checked)}
              />
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default EmailCategoryList;

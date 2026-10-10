import { createRequest } from "../containers/CrudRouter/lib/request";
import type { EmailCategoryChoice } from "../email/api";

export interface LifecycleStepNumbers {
  key: string;
  label: string;
  /** The signal that counts as the step working ("seen" = the user came back); "" = none. */
  target: string;
  delay_hours: number;
  sent: number;
  clicked: number;
  converted: number;
  unsubscribed: number;
  /** In the holdout: recorded, not sent. */
  holdout: number;
  holdout_converted: number;
}

export interface LifecycleJourney {
  key: string;
  label: string;
  description: string;
  category: string;
  trigger: string;
  scan: boolean;
  /** By status, for enrollments started in the range; `active_now` overall. */
  enrollments: Partial<Record<"active" | "done" | "exited" | "active_now", number>>;
  steps: LifecycleStepNumbers[];
}

export interface LifecycleOverview {
  enabled: boolean;
  problems: string[];
  days: number;
  journeys: LifecycleJourney[];
}

export interface LifecycleSendRow {
  id: string;
  user_id: string;
  journey: string;
  step: string;
  subject: string;
  holdout: boolean;
  target: string;
  sent_at: string;
  clicked_at: string | null;
  converted_at: string | null;
  unsubscribed_at: string | null;
}

export interface LifecyclePreview {
  skipped: boolean;
  subject: string;
  text: string;
  html: string;
}

/** platform_lifecycle's admin API (`/api/v1/lifecycle-emails`) - see its views.py. */
export function lifecycleApi(accessToken: string) {
  const request = createRequest(accessToken);
  const base = "/api/v1/lifecycle-emails";
  return {
    overview: (days: number) => request<LifecycleOverview>(`${base}/overview?days=${days}`),
    preview: (journey: string, step: string, userId?: string) =>
      request<LifecyclePreview>(`${base}/preview`, {
        method: "POST",
        body: JSON.stringify({ journey, step, ...(userId ? { user_id: userId } : {}) }),
      }),
    test: (journey: string, step: string, userId?: string) =>
      request<{ to: string; status: string; error: string }>(`${base}/test`, {
        method: "POST",
        body: JSON.stringify({ journey, step, ...(userId ? { user_id: userId } : {}) }),
      }),
    forUser: (userId: string) =>
      request<{ categories: EmailCategoryChoice[]; sends: LifecycleSendRow[] }>(
        `${base}/for-user?user_id=${encodeURIComponent(userId)}`,
      ),
  };
}

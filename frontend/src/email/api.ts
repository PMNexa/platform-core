import { createRequest } from "../containers/CrudRouter/lib/request";

/** One kind of email a user can turn off (platform_system's `EmailCategory`). */
export interface EmailCategoryChoice {
  key: string;
  label: string;
  help: string;
  enabled: boolean;
}

/** platform_system's email preferences API (`/api/v1/email/...`) - see its email_views.py. */
export function emailApi(accessToken: string) {
  const request = createRequest(accessToken);
  return {
    preferences: () => request<{ categories: EmailCategoryChoice[] }>("/api/v1/email/preferences"),
    save: (categories: Record<string, boolean>) =>
      request<{ categories: EmailCategoryChoice[] }>("/api/v1/email/preferences", {
        method: "PUT",
        body: JSON.stringify({ categories }),
      }),
  };
}

/** The same, signed out: the token from an email's unsubscribe link is the credential. */
export function unsubscribeApi(token: string) {
  const request = createRequest("");
  const url = `/api/v1/email/unsubscribe/${encodeURIComponent(token)}`;
  return {
    load: () => request<{ category: string; categories: EmailCategoryChoice[] }>(url),
    save: (categories: Record<string, boolean>) =>
      request<{ categories: EmailCategoryChoice[] }>(url, { method: "PUT", body: JSON.stringify({ categories }) }),
  };
}

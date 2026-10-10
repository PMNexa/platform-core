import { createRequest } from "../containers/CrudRouter/lib/request";

/** platform_system's admin API (`/api/v1/system-settings`) - see its views.py. */
export type SettingType = "bool" | "string" | "text" | "choice" | "list" | "int";

export interface SystemSetting {
  key: string;
  label: string;
  type: SettingType;
  group: string;
  help: string;
  choices: { value: string; label: string }[];
  value: unknown;
  default: unknown;
  /** `env`: set by the environment variable `env` - locked here. */
  source: "env" | "saved" | "default";
  env: string | null;
  editable: boolean;
}

export interface InfoGroup {
  group: string;
  rows: { label: string; value: string; hint?: string }[];
}

export interface SystemStatus {
  jobs: {
    name: string;
    last_run_at: string;
    last_ok_at: string | null;
    last_error: string;
    last_result: Record<string, unknown>;
    runs: number;
    failures: number;
    state: "ok" | "failing" | "stopped";
  }[];
  emails_24h: {
    sent: number;
    failed: number;
    queued: number;
    /** Not sent: every recipient was on the suppression list. */
    suppressed: number;
    /** Added to the suppression list from Amazon SES (platform_system/ses.py). */
    bounces: number;
    complaints: number;
    suppressed_total: number;
  };
  notifications_24h: { sent: number; failed: number };
  usage: InfoGroup[];
}

/** A cell of an Insights table: text, or text with a bar (share) or a heat shade (0-1). */
export type InsightCell = string | number | { text: string | number; bar?: number; heat?: number; hint?: string };

export type InsightBlock =
  | { kind: "tiles"; title?: string; items: { label: string; value: string | number; hint?: string }[] }
  | {
      kind: "table";
      title?: string;
      empty?: string;
      columns: { label: string; align?: "end" }[];
      rows: InsightCell[][];
    };

/** System > Insights (`/api/v1/system-settings/insights`) - see platform_system/insights.py. */
export interface Insights {
  days: number;
  start: string;
  end: string;
  previous_start: string;
  series: {
    key: string;
    label: string;
    group: string;
    help: string;
    /** "total": a level (shows its latest value); "daily": events per day (a range sums them). */
    kind: "total" | "daily";
    unit: string;
    /** [ISO date, value], from `previous_start` to `end`. */
    points: [string, number][];
  }[];
  sections: { key: string; title: string; description: string; blocks: InsightBlock[] }[];
}

export interface Announcement {
  text: string;
  level: "info" | "warning" | "danger";
  id: string;
}

export function systemApi(accessToken: string) {
  const request = createRequest(accessToken);
  return {
    list: () => request<{ settings: SystemSetting[]; info: InfoGroup[] }>("/api/v1/system-settings"),
    save: (key: string, value: unknown) =>
      request<SystemSetting>(`/api/v1/system-settings/${key}`, { method: "PATCH", body: JSON.stringify({ value }) }),
    reset: (key: string) => request<SystemSetting>(`/api/v1/system-settings/${key}`, { method: "DELETE" }),
    testEmail: (to: string) =>
      request<{ to: string; status: string; error: string }>("/api/v1/system-settings/test-email", {
        method: "POST",
        body: JSON.stringify(to ? { to } : {}),
      }),
    auditCsv: () => request<string>("/api/v1/audit-events/export"),
    status: () => request<SystemStatus>("/api/v1/system-settings/status"),
    insights: (days: number) => request<Insights>(`/api/v1/system-settings/insights?days=${days}`),
    insightsCsv: (days: number) => request<string>(`/api/v1/system-settings/insights-csv?days=${days}`),
    announcement: () => request<Announcement>("/api/v1/announcement"),
  };
}

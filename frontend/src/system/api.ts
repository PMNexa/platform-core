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
  emails_24h: { sent: number; failed: number; queued: number };
  notifications_24h: { sent: number; failed: number };
  usage: InfoGroup[];
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
    announcement: () => request<Announcement>("/api/v1/announcement"),
  };
}

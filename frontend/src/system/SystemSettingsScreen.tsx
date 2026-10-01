import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle, FormControl } from "../components";
import { systemApi, type InfoGroup, type SystemSetting } from "./api";

export interface SystemSettingsScreenProps {
  accessToken: string;
}

function toDraft(setting: SystemSetting): string | boolean {
  if (setting.type === "bool") return Boolean(setting.value);
  if (setting.type === "list") return ((setting.value as string[] | null) ?? []).join("\n");
  return setting.value === null || setting.value === undefined ? "" : String(setting.value);
}

function fromDraft(setting: SystemSetting, draft: string | boolean): unknown {
  if (setting.type === "bool") return Boolean(draft);
  if (setting.type === "list") return String(draft).split("\n").map((s) => s.trim()).filter(Boolean);
  if (setting.type === "int") return Number(draft);
  return draft;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SourceBadge({ setting }: { setting: SystemSetting }) {
  if (setting.source === "env")
    return (
      <span className="badge bg-azure-lt" title="Change it where the app is deployed - it can't be changed here.">
        Set by {setting.env}
      </span>
    );
  if (setting.source === "saved") return <span className="badge bg-green-lt">Saved</span>;
  return <span className="badge bg-secondary-lt">Default</span>;
}

function SettingRow({
  setting,
  onSaved,
  api,
}: {
  setting: SystemSetting;
  onSaved: (next: SystemSetting) => void;
  api: ReturnType<typeof systemApi>;
}) {
  const [draft, setDraft] = useState<string | boolean>(() => toDraft(setting));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameValue(fromDraft(setting, draft), setting.value);
  const id = `setting-${setting.key}`;

  async function run(action: () => Promise<SystemSetting>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      onSaved(next);
      setDraft(toDraft(next));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  }

  const disabled = !setting.editable || busy;
  let input;
  if (setting.type === "bool") {
    input = (
      <label className="form-check form-switch mb-0">
        <input
          id={id}
          className="form-check-input"
          type="checkbox"
          checked={Boolean(draft)}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.checked)}
        />
        <span className="form-check-label">{draft ? "On" : "Off"}</span>
      </label>
    );
  } else if (setting.type === "choice") {
    input = (
      <select id={id} className="form-select" value={String(draft)} disabled={disabled} onChange={(event) => setDraft(event.target.value)}>
        {setting.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    );
  } else if (setting.type === "list" || setting.type === "text") {
    input = (
      <textarea
        id={id}
        className="form-control"
        rows={3}
        value={String(draft)}
        disabled={disabled}
        placeholder={setting.type === "list" ? "One per line" : ""}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  } else {
    input = (
      <FormControl
        id={id}
        type={setting.type === "int" ? "number" : "text"}
        value={String(draft)}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }

  return (
    <div className="py-3 border-bottom">
      <div className="d-flex align-items-center gap-2 mb-1">
        <label htmlFor={id} className="fw-medium mb-0">
          {setting.label}
        </label>
        <SourceBadge setting={setting} />
      </div>
      <div className="row g-2 align-items-start">
        <div className="col-12 col-md-7">{input}</div>
        <div className="col-12 col-md-5 d-flex gap-2">
          {setting.editable && (
            <Button
              variant="primary"
              disabled={busy || !dirty}
              onClick={() => void run(() => api.save(setting.key, fromDraft(setting, draft)))}
            >
              Save
            </Button>
          )}
          {setting.editable && setting.source === "saved" && (
            <Button variant="secondary" outline disabled={busy} onClick={() => void run(() => api.reset(setting.key))}>
              Reset to default
            </Button>
          )}
        </div>
      </div>
      {setting.help && <small className="form-hint mt-1">{setting.help}</small>}
      {error && (
        <div className="text-danger small mt-1" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * The system admin's settings page (platform_system's
 * `/api/v1/system-settings`): every setting a module registered, grouped,
 * editable unless its environment variable sets it (then shown locked,
 * with the variable's name); the deployment's read-only facts (database,
 * email server, secrets - only whether they're set -, versions, limits);
 * a test email; and the audit log as CSV. RBAC decides who gets here
 * (`system-settings.view` / `.update`).
 */
function SystemSettingsScreen({ accessToken }: SystemSettingsScreenProps) {
  const api = useMemo(() => systemApi(accessToken), [accessToken]);
  const [settings, setSettings] = useState<SystemSetting[] | null>(null);
  const [info, setInfo] = useState<InfoGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .list()
      .then((data) => {
        if (cancelled) return;
        setSettings(data.settings);
        setInfo(data.info);
      })
      .catch((thrown: unknown) => !cancelled && setError(thrown instanceof Error ? thrown.message : String(thrown)));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, SystemSetting[]>();
    for (const setting of settings ?? []) byGroup.set(setting.group, [...(byGroup.get(setting.group) ?? []), setting]);
    return [...byGroup.entries()];
  }, [settings]);

  async function sendTest() {
    setBusy(true);
    setTestResult(null);
    try {
      const result = await api.testEmail(testTo.trim());
      setTestResult(
        result.status === "sent"
          ? { ok: true, text: `Sent to ${result.to}.` }
          : { ok: false, text: `Not sent: ${result.error || result.status}` },
      );
    } catch (thrown) {
      setTestResult({ ok: false, text: thrown instanceof Error ? thrown.message : String(thrown) });
    } finally {
      setBusy(false);
    }
  }

  async function downloadAudit() {
    try {
      const csv = await api.auditCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }

  if (error && settings === null) return <div className="alert alert-danger">{error}</div>;
  if (settings === null) return <div className="text-secondary">Loading…</div>;

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-7 d-flex flex-column gap-3">
        {groups.map(([group, rows]) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{group}</CardTitle>
            </CardHeader>
            <CardBody className="pt-0">
              {rows.map((setting) => (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  api={api}
                  onSaved={(next) => setSettings((prev) => prev?.map((s) => (s.key === next.key ? next : s)) ?? prev)}
                />
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="col-12 col-xl-5 d-flex flex-column gap-3">
        <Card>
          <CardHeader>
            <CardTitle>Test email</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="d-flex gap-2">
              <FormControl
                type="email"
                placeholder="Your own address"
                aria-label="Send a test email to"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
              />
              <Button variant="primary" disabled={busy} onClick={() => void sendTest()}>
                Send
              </Button>
            </div>
            {testResult && (
              <div className={`mt-2 small ${testResult.ok ? "text-success" : "text-danger"}`} role="status">
                {testResult.text}
              </div>
            )}
          </CardBody>
        </Card>
        {info.map((group) => (
          <Card key={group.group}>
            <CardHeader>
              <CardTitle>{group.group}</CardTitle>
              <span className="card-subtitle ms-auto text-secondary small">Read-only</span>
            </CardHeader>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="text-secondary w-50">
                        {row.label}
                        {row.hint && <div className="small text-muted font-monospace">{row.hint}</div>}
                      </td>
                      <td className="text-break">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
        <Card>
          <CardBody className="d-flex align-items-center justify-content-between">
            <span className="text-secondary">Every security event, as a spreadsheet.</span>
            <Button variant="secondary" outline onClick={() => void downloadAudit()}>
              Export audit log (CSV)
            </Button>
          </CardBody>
        </Card>
        {error && <div className="alert alert-danger mb-0">{error}</div>}
      </div>
    </div>
  );
}

export default SystemSettingsScreen;

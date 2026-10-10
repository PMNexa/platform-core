import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "../components";
import { systemApi, type SystemStatus } from "./api";

export interface SystemStatusScreenProps {
  accessToken: string;
}

const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const STATE: Record<string, [string, string]> = {
  ok: ["bg-green-lt", "Running"],
  failing: ["bg-red-lt", "Failing"],
  stopped: ["bg-yellow-lt", "Not running"],
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="col-6 col-md-3">
      <div className="text-secondary small">{label}</div>
      <div className={`h2 mb-0 ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

/**
 * The admin's Status page (`/api/v1/system-settings/status`): whether the
 * background scheduler is running (heartbeats - a job silent for 20
 * minutes shows "Not running"), what was delivered in the last day (email,
 * and notifications through Apprise), and every module's usage numbers.
 */
function SystemStatusScreen({ accessToken }: SystemStatusScreenProps) {
  const api = useMemo(() => systemApi(accessToken), [accessToken]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .status()
        .then((data) => !cancelled && setStatus(data))
        .catch((thrown: unknown) => !cancelled && setError(thrown instanceof Error ? thrown.message : String(thrown)));
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api]);

  if (error && !status) return <div className="alert alert-danger">{error}</div>;
  if (!status) return <div className="text-secondary">Loading…</div>;

  return (
    <div className="row g-3">
      <div className="col-12">
        <Card>
          <CardHeader>
            <CardTitle>Background jobs</CardTitle>
          </CardHeader>
          {status.jobs.length === 0 ? (
            <CardBody>
              <div className="alert alert-warning mb-0">
                No background job has ever reported in - reminders, digests and email retries aren't running. Start the
                scheduler service (<code>manage.py goalnexa_jobs --loop 300</code>).
              </div>
            </CardBody>
          ) : (
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>State</th>
                    <th>Last run</th>
                    <th>Last success</th>
                    <th>Runs / failures</th>
                    <th>Last result</th>
                  </tr>
                </thead>
                <tbody>
                  {status.jobs.map((job) => (
                    <tr key={job.name}>
                      <td className="font-monospace">{job.name}</td>
                      <td>
                        <span className={`badge ${STATE[job.state][0]}`}>{STATE[job.state][1]}</span>
                        {job.last_error && <div className="small text-danger mt-1">{job.last_error}</div>}
                      </td>
                      <td>{WHEN.format(new Date(job.last_run_at))}</td>
                      <td>{job.last_ok_at ? WHEN.format(new Date(job.last_ok_at)) : "—"}</td>
                      <td>
                        {job.runs} / {job.failures}
                      </td>
                      <td className="small text-secondary">
                        {Object.entries(job.last_result)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
                          .join(" · ") || "nothing to do"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <div className="col-12">
        <Card>
          <CardHeader>
            <CardTitle>Deliveries, last 24 hours</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="row g-3">
              <Stat label="Emails sent" value={status.emails_24h.sent} />
              <Stat label="Emails failed" value={status.emails_24h.failed} tone={status.emails_24h.failed ? "text-danger" : ""} />
              <Stat label="Notifications sent" value={status.notifications_24h.sent} />
              <Stat
                label="Notifications failed"
                value={status.notifications_24h.failed}
                tone={status.notifications_24h.failed ? "text-danger" : ""}
              />
            </div>
            <div className="row g-3 mt-1">
              <Stat label="Hard bounces" value={status.emails_24h.bounces} tone={status.emails_24h.bounces ? "text-warning" : ""} />
              <Stat
                label="Spam complaints"
                value={status.emails_24h.complaints}
                tone={status.emails_24h.complaints ? "text-danger" : ""}
              />
              <Stat label="Not sent (suppressed)" value={status.emails_24h.suppressed} />
              <Stat label="Suppressed addresses" value={status.emails_24h.suppressed_total} />
            </div>
            <div className="small text-secondary mt-2">
              Bounces and complaints come from Amazon SES (the <code>email.ses_*</code> settings); a bounced or
              complaining address gets no more mail until it's removed from the suppression list.
            </div>
            {status.emails_24h.queued > 0 && (
              <div className="small text-secondary mt-2">{status.emails_24h.queued} email(s) waiting to be retried.</div>
            )}
          </CardBody>
        </Card>
      </div>
      {status.usage.map((group) => (
        <div key={group.group} className="col-12 col-md-6 col-xl-4">
          <Card>
            <CardHeader>
              <CardTitle>{group.group}</CardTitle>
            </CardHeader>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="text-secondary">
                        {row.label}
                        {row.hint && <div className="small text-muted">{row.hint}</div>}
                      </td>
                      <td className="text-end fw-bold">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

export default SystemStatusScreen;

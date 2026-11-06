import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, type BadgeColor, Card, CardBody, CardHeader, CardTitle } from "../components";
import { systemApi, type SystemStatus } from "./api";
import { formatDateTime, formatNumber, useLocale, useT } from "../i18n";
import messages from "./messages";

export interface SystemStatusScreenProps {
  accessToken: string;
}

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
const STATE = {
  ok: ["green", "stateRunning"],
  failing: ["red", "stateFailing"],
  stopped: ["yellow", "stateStopped"],
} as const satisfies Record<string, readonly [BadgeColor, string]>;

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  const locale = useLocale();
  return (
    <div className="col-6 col-md-3">
      <div className="text-secondary small">{label}</div>
      <div className={`h2 mb-0 ${tone ?? ""}`}>{typeof value === "number" ? formatNumber(value, undefined, locale) : value}</div>
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
  const t = useT(messages);
  const locale = useLocale();

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

  if (error && !status) return <Alert variant="danger">{error}</Alert>;
  if (!status) return <div className="text-secondary">{t("loading")}</div>;

  return (
    <div className="row g-3">
      <div className="col-12">
        <Card>
          <CardHeader>
            <CardTitle>{t("backgroundJobs")}</CardTitle>
          </CardHeader>
          {status.jobs.length === 0 ? (
            <CardBody>
              <Alert variant="warning" className="mb-0">
                {t("noJobs")}
              </Alert>
            </CardBody>
          ) : (
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>{t("colJob")}</th>
                    <th>{t("colState")}</th>
                    <th>{t("colLastRun")}</th>
                    <th>{t("colLastSuccess")}</th>
                    <th>{t("colRunsFailures")}</th>
                    <th>{t("colLastResult")}</th>
                  </tr>
                </thead>
                <tbody>
                  {status.jobs.map((job) => (
                    <tr key={job.name}>
                      <td className="font-monospace">{job.name}</td>
                      <td>
                        <Badge color={STATE[job.state][0]}>{t(STATE[job.state][1])}</Badge>
                        {job.last_error && <div className="small text-danger mt-1">{job.last_error}</div>}
                      </td>
                      <td>{formatDateTime(job.last_run_at, WHEN, locale)}</td>
                      <td>{job.last_ok_at ? formatDateTime(job.last_ok_at, WHEN, locale) : "—"}</td>
                      <td>
                        {job.runs} / {job.failures}
                      </td>
                      <td className="small text-secondary">
                        {Object.entries(job.last_result)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
                          .join(" · ") || t("nothingToDo")}
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
            <CardTitle>{t("deliveries")}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="row g-3">
              <Stat label={t("emailsSent")} value={status.emails_24h.sent} />
              <Stat label={t("emailsFailed")} value={status.emails_24h.failed} tone={status.emails_24h.failed ? "text-danger" : ""} />
              <Stat label={t("notificationsSent")} value={status.notifications_24h.sent} />
              <Stat
                label={t("notificationsFailed")}
                value={status.notifications_24h.failed}
                tone={status.notifications_24h.failed ? "text-danger" : ""}
              />
            </div>
            <div className="row g-3 mt-1">
              <Stat label={t("hardBounces")} value={status.emails_24h.bounces} tone={status.emails_24h.bounces ? "text-warning" : ""} />
              <Stat
                label={t("spamComplaints")}
                value={status.emails_24h.complaints}
                tone={status.emails_24h.complaints ? "text-danger" : ""}
              />
              <Stat label={t("notSentSuppressed")} value={status.emails_24h.suppressed} />
              <Stat label={t("suppressedAddresses")} value={status.emails_24h.suppressed_total} />
            </div>
            <div className="small text-secondary mt-2">
              {t.rich("bouncesNote", { settings: "email.ses_*" })}
            </div>
            {status.emails_24h.queued > 0 && (
              <div className="small text-secondary mt-2">{t("queued", { n: status.emails_24h.queued })}</div>
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

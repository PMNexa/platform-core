import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, CardTitle, Modal } from "../components";
import { formatNumber, useLocale, useT, type Locale, type Translate } from "../i18n";
import { lifecycleApi, type LifecycleOverview, type LifecyclePreview, type LifecycleStepNumbers } from "./api";
import messages from "./messages";

type T = Translate<(typeof messages)["en"]>;

export interface SystemLifecycleScreenProps {
  accessToken: string;
  /** Where the console mounted its pages, for the links to the full log and the suppression list. @default "/system" */
  basePath?: string;
}

const RANGES = [7, 30, 90] as const;

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function percent(value: number | null, locale: Locale): string {
  return value === null ? "—" : formatNumber(value, { style: "percent", maximumFractionDigits: 0 }, locale);
}

function when(hours: number, t: T): string {
  if (hours === 0) return t("atOnce");
  if (hours < 48) return t("afterHours", { n: hours });
  return t("afterDays", { n: Math.round(hours / 24) });
}

/** Converted share vs. the holdout's, in percentage points - the step's effect. */
function lift(step: LifecycleStepNumbers, t: T): string {
  const sent = rate(step.converted, step.sent);
  const held = rate(step.holdout_converted, step.holdout);
  if (sent === null || held === null) return "—";
  const points = Math.round((sent - held) * 100);
  return t("points", { points: `${points > 0 ? "+" : ""}${points}` });
}

interface Picked {
  journey: string;
  step: string;
  label: string;
}

/**
 * System > Lifecycle email: every journey (onboarding, tips, milestones,
 * win-back, team, ...) with each step's numbers over the chosen range -
 * sent, clicked, converted (its target action within 72 hours),
 * unsubscribed - next to the holdout's conversion, so a step's effect
 * shows as the difference. Each step can be previewed with any user's
 * data and sent to yourself.
 */
function SystemLifecycleScreen({ accessToken, basePath = "/system" }: SystemLifecycleScreenProps) {
  const t = useT(messages);
  const locale = useLocale();
  const api = useMemo(() => lifecycleApi(accessToken), [accessToken]);
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<LifecycleOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .overview(days)
      .then((result) => !cancelled && setData(result))
      .catch((thrown: unknown) => !cancelled && setError(thrown instanceof Error ? thrown.message : String(thrown)));
    return () => {
      cancelled = true;
    };
  }, [api, days]);

  if (error && !data) return <Alert variant="danger">{error}</Alert>;
  if (!data) return <div className="text-secondary">{t("loading")}</div>;
  const base = `/${basePath.replace(/^\/+|\/+$/g, "")}`;

  return (
    <div className="row g-3">
      <div className="col-12 d-flex flex-wrap align-items-center gap-2">
        <div className="text-secondary small me-auto">
          {t.rich("intro", {})}
        </div>
        <div className="btn-group" role="group" aria-label={t("range")}>
          {RANGES.map((range) => (
            <Button key={range} size="sm" variant="secondary" outline={days !== range} onClick={() => setDays(range)}>
              {t("days", { n: range })}
            </Button>
          ))}
        </div>
      </div>
      {data.problems.length > 0 && (
        <div className="col-12">
          <Alert variant="warning" title={t("nothingSent")} className="mb-0">
            <ul className="mb-0">
              {data.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      {data.journeys.map((journey) => (
        <div key={journey.key} className="col-12">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  {journey.label} <Badge className="ms-1">{journey.category}</Badge>
                </CardTitle>
                <div className="small text-secondary">{journey.description}</div>
              </div>
              <div className="card-actions small text-secondary text-end">
                <div>
                  {t("enrolled", {
                    now: journey.enrollments.active_now ?? 0,
                    entered:
                      (journey.enrollments.active ?? 0) + (journey.enrollments.done ?? 0) + (journey.enrollments.exited ?? 0),
                    days: data.days,
                  })}
                </div>
                <div>
                  {journey.trigger
                    ? t.rich("startsOn", { trigger: <code>{journey.trigger}</code> })
                    : journey.scan
                      ? t("startsFromScan")
                      : t("startsNone")}
                </div>
              </div>
            </CardHeader>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>{t("colStep")}</th>
                    <th>{t("colWhen")}</th>
                    <th className="text-end">{t("colSent")}</th>
                    <th className="text-end">{t("colClicked")}</th>
                    <th className="text-end">{t("colConverted")}</th>
                    <th className="text-end">{t("colHoldout")}</th>
                    <th className="text-end">{t("colLift")}</th>
                    <th className="text-end">{t("colUnsubscribed")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {journey.steps.map((step) => (
                    <tr key={step.key}>
                      <td>
                        {step.label}
                        <div className="small text-secondary">
                          <code>{step.key}</code>
                          {step.target && <> → {step.target === "seen" ? t("comesBack") : <code>{step.target}</code>}</>}
                        </div>
                      </td>
                      <td className="text-secondary">{when(step.delay_hours, t)}</td>
                      <td className="text-end">{step.sent}</td>
                      <td className="text-end">{percent(rate(step.clicked, step.sent), locale)}</td>
                      <td className="text-end">{percent(rate(step.converted, step.sent), locale)}</td>
                      <td className="text-end" title={t("holdoutOf", { converted: step.holdout_converted, total: step.holdout })}>
                        {percent(rate(step.holdout_converted, step.holdout), locale)}
                      </td>
                      <td className="text-end fw-bold">{lift(step, t)}</td>
                      <td className="text-end">{percent(rate(step.unsubscribed, step.sent), locale)}</td>
                      <td className="text-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          outline
                          onClick={() => setPicked({ journey: journey.key, step: step.key, label: `${journey.label}: ${step.label}` })}
                        >
                          {t("preview")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ))}
      <div className="col-12 small text-secondary">
        {t.rich("footer", {
          log: <a href={`${base}/lifecycle-emails`}>{t("logLink")}</a>,
          suppressed: <a href={`${base}/email-suppressions`}>{t("suppressedLink")}</a>,
          settings: <a href={`${base}/settings`}>{t("settingsLink")}</a>,
        })}
      </div>
      {picked && <PreviewModal api={api} picked={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function PreviewModal({
  api,
  picked,
  onClose,
}: {
  api: ReturnType<typeof lifecycleApi>;
  picked: Picked;
  onClose: () => void;
}) {
  const t = useT(messages);
  const [userId, setUserId] = useState("");
  const [preview, setPreview] = useState<LifecyclePreview | null>(null);
  const [showText, setShowText] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(forUser: string) {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.preview(picked.journey, picked.step, forUser.trim() || undefined));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.test(picked.journey, picked.step, userId.trim() || undefined);
      if (result.status === "sent") setNotice(t("sentTo", { to: result.to }));
      else setError(t("notSent", { status: result.status, error: result.error }));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load("");
    // Load once for the caller; a user id is applied with the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.journey, picked.step]);

  return (
    <Modal
      open
      size="lg"
      title={picked.label}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" outline onClick={onClose}>
            {t("close")}
          </Button>
          <Button variant="primary" disabled={busy || !preview || preview.skipped} onClick={() => void sendTest()}>
            {t("sendTest")}
          </Button>
        </>
      }
    >
      <form
        className="d-flex gap-2 mb-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load(userId);
        }}
      >
        <input
          className="form-control form-control-sm"
          placeholder={t("userPlaceholder")}
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          {t("render")}
        </Button>
      </form>
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {!preview ? (
        <div className="text-secondary">{t("loading")}</div>
      ) : preview.skipped ? (
        <Alert variant="info" className="mb-0">
          {t("skipped")}
        </Alert>
      ) : (
        <>
          <div className="d-flex align-items-center mb-2">
            <div className="fw-bold me-auto">{preview.subject}</div>
            <Button size="sm" variant="link" onClick={() => setShowText((v) => !v)}>
              {showText ? t("html") : t("plainText")}
            </Button>
          </div>
          {showText ? (
            <pre className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>
              {preview.text}
            </pre>
          ) : (
            <iframe
              title={t("emailPreview")}
              sandbox=""
              srcDoc={preview.html}
              style={{ width: "100%", height: "26rem", border: "1px solid var(--tblr-border-color, #e6e7e9)", borderRadius: 4 }}
            />
          )}
        </>
      )}
    </Modal>
  );
}

export default SystemLifecycleScreen;

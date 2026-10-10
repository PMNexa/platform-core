import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardHeader, CardTitle, Modal } from "../components";
import { lifecycleApi, type LifecycleOverview, type LifecyclePreview, type LifecycleStepNumbers } from "./api";

export interface SystemLifecycleScreenProps {
  accessToken: string;
  /** Where the console mounted its pages, for the links to the full log and the suppression list. @default "/system" */
  basePath?: string;
}

const RANGES = [7, 30, 90] as const;

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function when(hours: number): string {
  if (hours === 0) return "At once";
  if (hours < 48) return `+${hours}h`;
  return `+${Math.round(hours / 24)} days`;
}

/** Converted share vs. the holdout's, in percentage points - the step's effect. */
function lift(step: LifecycleStepNumbers): string {
  const sent = rate(step.converted, step.sent);
  const held = rate(step.holdout_converted, step.holdout);
  if (sent === null || held === null) return "—";
  const points = Math.round((sent - held) * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
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

  if (error && !data) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className="text-secondary">Loading…</div>;
  const base = `/${basePath.replace(/^\/+|\/+$/g, "")}`;

  return (
    <div className="row g-3">
      <div className="col-12 d-flex flex-wrap align-items-center gap-2">
        <div className="text-secondary small me-auto">
          Each step's target action within 72 hours counts as converted. The holdout gets nothing and is measured the
          same way, so <strong>lift</strong> is what the email added.
        </div>
        <div className="btn-group" role="group" aria-label="Range">
          {RANGES.map((range) => (
            <Button key={range} size="sm" variant="secondary" outline={days !== range} onClick={() => setDays(range)}>
              {range} days
            </Button>
          ))}
        </div>
      </div>
      {data.problems.length > 0 && (
        <div className="col-12">
          <div className="alert alert-warning mb-0">
            <div className="fw-bold">Nothing is being sent:</div>
            <ul className="mb-0">
              {data.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {data.journeys.map((journey) => (
        <div key={journey.key} className="col-12">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  {journey.label} <span className="badge bg-secondary-lt ms-1">{journey.category}</span>
                </CardTitle>
                <div className="small text-secondary">{journey.description}</div>
              </div>
              <div className="card-actions small text-secondary text-end">
                <div>
                  {journey.enrollments.active_now ?? 0} in it now · {(journey.enrollments.active ?? 0) +
                    (journey.enrollments.done ?? 0) + (journey.enrollments.exited ?? 0)} entered in {data.days} days
                </div>
                <div>
                  Starts {journey.trigger ? <>on <code>{journey.trigger}</code></> : journey.scan ? "from a scan" : "—"}
                </div>
              </div>
            </CardHeader>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>When</th>
                    <th className="text-end">Sent</th>
                    <th className="text-end">Clicked</th>
                    <th className="text-end">Converted</th>
                    <th className="text-end">Holdout conv.</th>
                    <th className="text-end">Lift</th>
                    <th className="text-end">Unsubscribed</th>
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
                          {step.target && <> → {step.target === "seen" ? "comes back" : <code>{step.target}</code>}</>}
                        </div>
                      </td>
                      <td className="text-secondary">{when(step.delay_hours)}</td>
                      <td className="text-end">{step.sent}</td>
                      <td className="text-end">{percent(rate(step.clicked, step.sent))}</td>
                      <td className="text-end">{percent(rate(step.converted, step.sent))}</td>
                      <td className="text-end" title={`${step.holdout_converted} of ${step.holdout}`}>
                        {percent(rate(step.holdout_converted, step.holdout))}
                      </td>
                      <td className="text-end fw-bold">{lift(step)}</td>
                      <td className="text-end">{percent(rate(step.unsubscribed, step.sent))}</td>
                      <td className="text-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          outline
                          onClick={() => setPicked({ journey: journey.key, step: step.key, label: `${journey.label}: ${step.label}` })}
                        >
                          Preview
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
        Every message: <a href={`${base}/lifecycle-emails`}>lifecycle email log</a> · Addresses nothing goes to:{" "}
        <a href={`${base}/email-suppressions`}>suppressed addresses</a> · Settings (cap, quiet hours, holdout):{" "}
        <a href={`${base}/settings`}>System settings</a>
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
      if (result.status === "sent") setNotice(`Sent to ${result.to}.`);
      else setError(`Not sent (${result.status}): ${result.error}`);
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
            Close
          </Button>
          <Button variant="primary" disabled={busy || !preview || preview.skipped} onClick={() => void sendTest()}>
            Send a test to me
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
          placeholder="Render with a user's data - their id (empty: you)"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          Render
        </Button>
      </form>
      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {!preview ? (
        <div className="text-secondary">Loading…</div>
      ) : preview.skipped ? (
        <div className="alert alert-info mb-0">
          Skipped for this user - the step's condition doesn't hold for them right now (e.g. they already did what it
          asks).
        </div>
      ) : (
        <>
          <div className="d-flex align-items-center mb-2">
            <div className="fw-bold me-auto">{preview.subject}</div>
            <Button size="sm" variant="link" onClick={() => setShowText((v) => !v)}>
              {showText ? "HTML" : "Plain text"}
            </Button>
          </div>
          {showText ? (
            <pre className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>
              {preview.text}
            </pre>
          ) : (
            <iframe
              title="Email preview"
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

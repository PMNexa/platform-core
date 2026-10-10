import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "../components";
import type { EmailCategoryChoice } from "../email/api";
import { lifecycleApi, type LifecycleSendRow } from "./api";

export interface UserLifecyclePanelProps {
  accessToken: string;
  userId: string;
}

const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * For a user's page in the system console: their email preferences and
 * the lifecycle emails they got (or, in the holdout, would have), with
 * what followed each. Renders nothing where lifecycle email isn't
 * installed (the API answers 404).
 */
function UserLifecyclePanel({ accessToken, userId }: UserLifecyclePanelProps) {
  const api = useMemo(() => lifecycleApi(accessToken), [accessToken]);
  const [data, setData] = useState<{ categories: EmailCategoryChoice[]; sends: LifecycleSendRow[] } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .forUser(userId)
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setHidden(true));
    return () => {
      cancelled = true;
    };
  }, [api, userId]);

  if (hidden || !data) return null;
  const off = data.categories.filter((c) => !c.enabled);

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle>Lifecycle email</CardTitle>
      </CardHeader>
      <CardBody className="border-bottom">
        <span className="text-secondary">Turned off: </span>
        {off.length ? off.map((c) => c.label).join(", ") : "nothing - every category is on"}
      </CardBody>
      {data.sends.length === 0 ? (
        <CardBody className="text-secondary">No lifecycle email yet.</CardBody>
      ) : (
        <div className="table-responsive">
          <table className="table table-vcenter card-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Email</th>
                <th>Then</th>
              </tr>
            </thead>
            <tbody>
              {data.sends.map((send) => (
                <tr key={send.id}>
                  <td className="text-nowrap">{WHEN.format(new Date(send.sent_at))}</td>
                  <td>
                    {send.subject}
                    <div className="small text-secondary">
                      <code>
                        {send.journey}.{send.step}
                      </code>
                      {send.holdout && <span className="badge bg-secondary-lt ms-2">holdout - not sent</span>}
                    </div>
                  </td>
                  <td className="small">
                    {[
                      send.clicked_at && "clicked",
                      send.converted_at && "converted",
                      send.unsubscribed_at && "unsubscribed",
                    ]
                      .filter(Boolean)
                      .join(", ") || <span className="text-secondary">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default UserLifecyclePanel;

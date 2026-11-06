import { useEffect, useMemo, useState } from "react";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "../components";
import type { EmailCategoryChoice } from "../email/api";
import { formatDateTime, useLocale, useT } from "../i18n";
import { lifecycleApi, type LifecycleSendRow } from "./api";
import messages from "./messages";

export interface UserLifecyclePanelProps {
  accessToken: string;
  userId: string;
}

/**
 * For a user's page in the system console: their email preferences and
 * the lifecycle emails they got (or, in the holdout, would have), with
 * what followed each. Renders nothing where lifecycle email isn't
 * installed (the API answers 404).
 */
function UserLifecyclePanel({ accessToken, userId }: UserLifecyclePanelProps) {
  const t = useT(messages);
  const locale = useLocale();
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
        <CardTitle>{t("panelTitle")}</CardTitle>
      </CardHeader>
      <CardBody className="border-bottom">
        <span className="text-secondary">{t("turnedOff")} </span>
        {off.length ? off.map((c) => c.label).join(", ") : t("nothingOff")}
      </CardBody>
      {data.sends.length === 0 ? (
        <CardBody className="text-secondary">{t("noneYet")}</CardBody>
      ) : (
        <div className="table-responsive">
          <table className="table table-vcenter card-table">
            <thead>
              <tr>
                <th>{t("colWhen")}</th>
                <th>{t("colEmail")}</th>
                <th>{t("colThen")}</th>
              </tr>
            </thead>
            <tbody>
              {data.sends.map((send) => (
                <tr key={send.id}>
                  <td className="text-nowrap">{formatDateTime(send.sent_at, { dateStyle: "medium", timeStyle: "short" }, locale)}</td>
                  <td>
                    {send.subject}
                    <div className="small text-secondary">
                      <code>
                        {send.journey}.{send.step}
                      </code>
                      {send.holdout && <Badge className="ms-2">{t("holdoutNotSent")}</Badge>}
                    </div>
                  </td>
                  <td className="small">
                    {[
                      send.clicked_at && t("clicked"),
                      send.converted_at && t("converted"),
                      send.unsubscribed_at && t("unsubscribed"),
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

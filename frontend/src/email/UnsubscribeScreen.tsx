import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody } from "../components";
import { unsubscribeApi, type EmailCategoryChoice } from "./api";
import EmailCategoryList from "./EmailCategoryList";
import { useT } from "../i18n";
import messages from "./messages";

export interface UnsubscribeScreenProps {
  /** The token from the email's link. */
  token: string;
}

function errorText(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * Where an email's "Unsubscribe" footer link lands - no login. Opening it
 * changes nothing (mail scanners open links too): the email's own
 * category is marked, with a button to stop it, a button to stop
 * everything but account mail, and a switch per category.
 */
function UnsubscribeScreen({ token }: UnsubscribeScreenProps) {
  const t = useT(messages);
  const api = useMemo(() => unsubscribeApi(token), [token]);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<EmailCategoryChoice[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .load()
      .then((data) => {
        if (cancelled) return;
        setCategory(data.category);
        setCategories(data.categories);
      })
      .catch((thrown: unknown) => !cancelled && setError(errorText(thrown)));
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function save(choices: Record<string, boolean>, done: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      setCategories((await api.save(choices)).categories);
      setNotice(done);
    } catch (thrown) {
      setError(errorText(thrown));
    } finally {
      setSaving(false);
    }
  }

  const current = categories?.find((c) => c.key === category);

  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <h1 className="h2 text-center mb-4">{t("title")}</h1>
        <Card>
          <CardBody>
            {error && <Alert variant="danger">{error}</Alert>}
            {notice && <Alert variant="success">{notice}</Alert>}
            {!categories ? (
              !error && <div className="text-secondary">{t("loading")}</div>
            ) : (
              <>
                {current && (
                  <div className="mb-3">
                    {current.enabled ? (
                      <Button
                        variant="primary"
                        size="md"
                        className="w-100"
                        disabled={saving}
                        onClick={() => void save({ [current.key]: false }, t("stopped", { label: current.label }))}
                      >
                        {t("unsubscribeFrom", { label: current.label })}
                      </Button>
                    ) : (
                      <div className="text-secondary">{t("unsubscribed", { label: current.label })}</div>
                    )}
                  </div>
                )}
                <EmailCategoryList
                  categories={categories}
                  highlight={category}
                  disabled={saving}
                  onToggle={(key, on) => void save({ [key]: on }, t("saved"))}
                />
                <Button
                  variant="link"
                  className="w-100 mt-2"
                  disabled={saving || categories.every((c) => !c.enabled)}
                  onClick={() =>
                    void save(
                      Object.fromEntries(categories.map((c) => [c.key, false])),
                      t("unsubscribedAll"),
                    )
                  }
                >
                  {t("unsubscribeAll")}
                </Button>
              </>
            )}
          </CardBody>
        </Card>
        <p className="text-center text-secondary small mt-3">
          {t("alwaysSent")}
        </p>
      </div>
    </div>
  );
}

export default UnsubscribeScreen;

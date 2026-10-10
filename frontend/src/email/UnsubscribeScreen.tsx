import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody } from "../components";
import { unsubscribeApi, type EmailCategoryChoice } from "./api";
import EmailCategoryList from "./EmailCategoryList";

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
        <h1 className="h2 text-center mb-4">Email preferences</h1>
        <Card>
          <CardBody>
            {error && <div className="alert alert-danger">{error}</div>}
            {notice && <div className="alert alert-success">{notice}</div>}
            {!categories ? (
              !error && <div className="text-secondary">Loading…</div>
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
                        onClick={() => void save({ [current.key]: false }, `You won't get "${current.label}" emails any more.`)}
                      >
                        Unsubscribe from "{current.label}"
                      </Button>
                    ) : (
                      <div className="text-secondary">You're unsubscribed from "{current.label}".</div>
                    )}
                  </div>
                )}
                <EmailCategoryList
                  categories={categories}
                  highlight={category}
                  disabled={saving}
                  onToggle={(key, on) => void save({ [key]: on }, "Saved.")}
                />
                <Button
                  variant="link"
                  className="w-100 mt-2"
                  disabled={saving || categories.every((c) => !c.enabled)}
                  onClick={() =>
                    void save(
                      Object.fromEntries(categories.map((c) => [c.key, false])),
                      "Unsubscribed from everything. You'll still get account emails (password resets and the like).",
                    )
                  }
                >
                  Unsubscribe from all
                </Button>
              </>
            )}
          </CardBody>
        </Card>
        <p className="text-center text-secondary small mt-3">
          Account emails - confirming your address, password resets, security notices - are always sent.
        </p>
      </div>
    </div>
  );
}

export default UnsubscribeScreen;

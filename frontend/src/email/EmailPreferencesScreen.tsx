import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "../components";
import { emailApi, type EmailCategoryChoice } from "./api";
import EmailCategoryList from "./EmailCategoryList";

export interface EmailPreferencesScreenProps {
  accessToken: string;
}

function errorText(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * The signed-in user's email preferences (`/api/v1/email/preferences`):
 * one switch per category, saved as it's flipped. Account mail
 * (confirmation, password reset, security) isn't listed - it always goes.
 */
function EmailPreferencesScreen({ accessToken }: EmailPreferencesScreenProps) {
  const api = useMemo(() => emailApi(accessToken), [accessToken]);
  const [categories, setCategories] = useState<EmailCategoryChoice[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .preferences()
      .then((data) => !cancelled && setCategories(data.categories))
      .catch((thrown: unknown) => !cancelled && setError(errorText(thrown)));
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function toggle(key: string, enabled: boolean) {
    setSaving(true);
    setError(null);
    setCategories((current) => current?.map((c) => (c.key === key ? { ...c, enabled } : c)) ?? null);
    try {
      setCategories((await api.save({ [key]: enabled })).categories);
    } catch (thrown) {
      setError(errorText(thrown));
      setCategories((current) => current?.map((c) => (c.key === key ? { ...c, enabled: !enabled } : c)) ?? null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container-narrow" style={{ maxWidth: "40rem" }}>
      <Card>
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-secondary">
            Choose what we email you about. Account emails - confirming your address, resetting your password,
            security notices - are always sent.
          </p>
          {error && <div className="alert alert-danger">{error}</div>}
          {!categories ? (
            !error && <div className="text-secondary">Loading…</div>
          ) : categories.length === 0 ? (
            <div className="text-secondary">This instance sends account emails only.</div>
          ) : (
            <EmailCategoryList categories={categories} onToggle={(key, on) => void toggle(key, on)} disabled={saving} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default EmailPreferencesScreen;

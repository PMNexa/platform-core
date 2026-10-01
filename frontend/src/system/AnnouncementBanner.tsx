import { useEffect, useMemo, useState } from "react";
import { systemApi, type Announcement } from "./api";

const DISMISSED_KEY = "platform-system:dismissed-announcement";

function dismissedId(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * The admin's announcement (System > Settings > Announcement), shown at
 * the top of every signed-in page until dismissed - a new text shows
 * again. Fetched once per mount; renders nothing when there's none.
 */
export default function AnnouncementBanner({ accessToken }: { accessToken: string }) {
  const api = useMemo(() => systemApi(accessToken), [accessToken]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .announcement()
      .then((data) => !cancelled && setAnnouncement(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (!announcement?.text || hidden || dismissedId() === announcement.id) return null;
  return (
    <div className={`alert alert-${announcement.level} alert-dismissible mb-3`} role="status">
      <div style={{ whiteSpace: "pre-wrap" }}>{announcement.text}</div>
      <button
        type="button"
        className="btn-close"
        aria-label="Dismiss"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISSED_KEY, announcement.id);
          } catch {
            // Shown again next time - harmless.
          }
          setHidden(true);
        }}
      />
    </div>
  );
}

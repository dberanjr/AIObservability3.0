import React, { useEffect, useState } from "react";

/**
 * Field Notes — a static reference document (the AI Observability customer
 * brief), vendored into `ui/assets/field-notes.html` and served same-origin.
 *
 * We do NOT frame the asset by URL: AppEngine serves static assets with
 * framing-blocking headers (X-Frame-Options / frame-ancestors), so
 * `<iframe src="./assets/…">` fails with "refused to connect". Instead we
 * FETCH the HTML (same-origin, allowed) and render it inline via `srcDoc` —
 * there's no HTTP response to frame, so the block doesn't apply, and the
 * iframe still gives the document its own isolated html/body context so its
 * styling can't leak into the app. A direct link is offered as a fallback.
 */
const ASSET_URL = "./assets/field-notes.html";

const LOADING_DOC =
  "<!doctype html><meta charset=utf-8><body style='margin:0;font-family:system-ui,sans-serif;color:#8a8f98;padding:24px'>Loading Field Notes…</body>";

export const FieldNotesPage = () => {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(ASSET_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (alive) setHtml(t);
      })
      .catch((e) => {
        if (alive) setError(String(e?.message ?? e));
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "80vh",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 14px",
          fontSize: 12,
        }}
      >
        <a
          href={ASSET_URL}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--blue)", textDecoration: "none" }}
        >
          Open in a new tab ↗
        </a>
      </div>
      {error ? (
        <div style={{ padding: 24, color: "var(--text-2)", fontSize: 13 }}>
          Couldn&apos;t load the Field Notes document ({error}). Use the “Open in
          a new tab” link above.
        </div>
      ) : (
        <iframe
          srcDoc={html ?? LOADING_DOC}
          title="AI Observability Field Notes"
          style={{ flex: 1, width: "100%", minHeight: "80vh", border: 0 }}
        />
      )}
    </div>
  );
};

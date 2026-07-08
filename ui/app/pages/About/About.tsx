// Standard About / attribution page for the AI Observability 3.0 App.
//
// Build metadata (version / commit hash / commit date) comes from the generated
// module written by scripts/build-info.mjs (regenerated on every build via the
// npm prebuild/predeploy/prestart hooks). Scopes mirror app.config.json exactly.

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Borders from "@dynatrace/strato-design-tokens/borders";
import { APP_VERSION, COMMIT_HASH, COMMIT_DATE } from "../../generated/build-info";

// ─── CONFIG ─────────────────────────────────────────────────────────
const CONFIG = {
  appName: "AI Observability 3.0 App",
  author: "David Beran",
  maintainers: "David Beran",
  email: "david.beran@dynatrace.com",
  repoLabel: "github.com/dberanjr/AIObservability3.0",
  repoUrl: "https://github.com/dberanjr/AIObservability3.0",
  license: "MIT",
  environment: "Registered on your current Dynatrace tenant",
  description: "End-to-end observability for agentic AI workloads.",
  showDisclaimer: true,
};

// Scopes the app requests, mirroring app.config.json. `write` flags the three
// scopes that persist the app's own settings/state (never tenant data).
const SCOPES: { name: string; desc: string; write?: boolean }[] = [
  { name: "storage:logs:read", desc: "Read application logs for guardrail and error detection" },
  { name: "storage:metrics:read", desc: "Read metrics for Pulse reliability score and forecasting" },
  { name: "storage:spans:read", desc: "Read spans for agent, tool, model, and prompt analysis" },
  { name: "storage:bizevents:read", desc: "Read business events for evaluation scores" },
  { name: "storage:events:read", desc: "Read Davis problems for the reliability score's open-problems component" },
  { name: "storage:entities:read", desc: "Resolve AppCI entity IDs and service names" },
  { name: "storage:lookups:read", desc: "Look up CMDB entities for scope resolution" },
  { name: "storage:buckets:read", desc: "Grail bucket-level access to spans/events/logs/metrics" },
  { name: "davis:analyzers:execute", desc: "Run Davis AI analyzers for token-usage forecasting" },
  { name: "app-settings:objects:read", desc: "Read per-user settings (privacy mode, pricing overrides, columns)" },
  { name: "app-settings:objects:write", desc: "Persist per-user settings changes", write: true },
  { name: "state:user-app-states:read", desc: "Read per-user persisted state (scan limit, SLA thresholds, privacy mode)" },
  { name: "state:user-app-states:write", desc: "Persist per-user state changes", write: true },
  { name: "state:app-states:read", desc: "Read org-wide app state (shared model pricing overrides)" },
  { name: "state:app-states:write", desc: "Persist org-wide app state (model pricing edits)", write: true },
  { name: "storage:filter-segments:read", desc: "Read tenant-defined filter segments to apply as scope filters" },
  { name: "storage:files:read", desc: "Read tabular lookup files under /lookups/dynatrace/*" },
  { name: "storage:smartscape:read", desc: "Read smartscape.nodes / smartscape.relations for topology-based scoping" },
];

function formatBuildDate(iso: string): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const date = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
  return `${date} · ${time}`;
}

export const About = () => {
  const buildDate = formatBuildDate(COMMIT_DATE);
  const year = (COMMIT_DATE ? new Date(COMMIT_DATE) : new Date()).getFullYear();

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "App", value: CONFIG.appName },
    { label: "Version", value: <code>v{APP_VERSION}</code> },
    {
      label: "Build",
      value: (
        <span>
          {buildDate} · <code>{COMMIT_HASH}</code>
        </span>
      ),
    },
    { label: "Author", value: CONFIG.author },
    { label: "Maintainers", value: CONFIG.maintainers },
    {
      label: "Email",
      value: <a href={`mailto:${CONFIG.email}`}>{CONFIG.email}</a>,
    },
    {
      label: "Repository",
      value: (
        <a href={CONFIG.repoUrl} target="_blank" rel="noopener noreferrer">
          {CONFIG.repoLabel}
        </a>
      ),
    },
    {
      label: "Support",
      value: (
        <span>
          <a href={`${CONFIG.repoUrl}/issues/new`} target="_blank" rel="noopener noreferrer">
            Report an issue
          </a>
          {" · "}
          <a
            href={`${CONFIG.repoUrl}/issues/new?labels=enhancement`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Request a feature
          </a>
        </span>
      ),
    },
    { label: "License", value: CONFIG.license },
    { label: "Environment", value: CONFIG.environment },
    { label: "Description", value: CONFIG.description },
  ];

  const cardStyle: React.CSSProperties = {
    background: Colors.Background.Surface.Default,
    border: `1px solid ${Colors.Border.Neutral.Default}`,
    borderRadius: Borders.Radius.Container.Default,
    padding: "22px 24px",
  };

  return (
    <Flex flexDirection="column" gap={16} padding={24} style={{ maxWidth: 1000 }}>
      <Heading level={1}>About</Heading>

      {/* Attribution card */}
      <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", rowGap: 12, columnGap: 16 }}>
          {rows.map((row) => (
            <React.Fragment key={row.label}>
              <Text
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "1.2px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: Colors.Text.Neutral.Subdued,
                }}
              >
                {row.label}
              </Text>
              <Text style={{ color: Colors.Text.Neutral.Default }}>{row.value}</Text>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Permissions card */}
      {SCOPES.length > 0 ? (
        <div style={cardStyle}>
          <Heading level={2} style={{ marginBottom: 16 }}>
            Grail permissions required
          </Heading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {SCOPES.map((scope) => (
              <div
                key={scope.name}
                style={{
                  padding: "14px 16px",
                  borderRadius: Borders.Radius.Field.Default,
                  background: Colors.Background.Container.Neutral.Default,
                  border: `1px solid ${Colors.Border.Neutral.Default}`,
                }}
              >
                <code
                  style={{
                    display: "block",
                    color: scope.write
                      ? Colors.Text.Warning.Default
                      : Colors.Text.Success.Default,
                    wordBreak: "break-word",
                  }}
                >
                  {scope.name}
                </code>
                <Text style={{ display: "block", marginTop: 6, color: Colors.Text.Neutral.Subdued }}>
                  {scope.desc}
                </Text>
              </div>
            ))}
          </div>
          <Paragraph style={{ marginTop: 16, color: Colors.Text.Neutral.Subdued }}>
            All scopes are requested at install time via the platform token dialog.
            Every data scope is read-only; the three <code>:write</code> scopes
            persist only this app's own settings and state (privacy mode, scan
            limits, model-pricing overrides) — none grant write access to your
            observability data.
          </Paragraph>
        </div>
      ) : null}

      {/* Disclaimer */}
      {CONFIG.showDisclaimer ? (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: Borders.Radius.Container.Default,
            color: Colors.Text.Warning.Default,
            background: Colors.Background.Container.Warning.Default,
            border: `1px solid ${Colors.Border.Warning.Default}`,
          }}
        >
          <Text style={{ color: Colors.Text.Warning.Default, fontWeight: 600 }}>
            Field developed, not supported by Dynatrace. Use at your own risk.
          </Text>
        </div>
      ) : null}

      {/* Footer */}
      <div style={cardStyle}>
        <Text style={{ color: Colors.Text.Neutral.Subdued }}>
          {CONFIG.appName}
          <br />
          Copyright {year} {CONFIG.author}. All rights reserved.
        </Text>
        <Paragraph style={{ marginTop: 8, color: Colors.Text.Neutral.Subdued }}>
          This app queries Dynatrace Grail data within your tenant. No data leaves
          Dynatrace.
        </Paragraph>
      </div>
    </Flex>
  );
};

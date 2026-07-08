import React from "react";
import { Link } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { InformationIcon, WarningIcon, ExternalLinkIcon } from "@dynatrace/strato-icons";
import { InfoTooltip } from "./InfoTooltip";

/** AttributeAudit page route — see App.tsx <Route path="/attributes">. */
const ATTRIBUTE_AUDIT_ROUTE = "/attributes";

/**
 * Instrumentation-requirement codes (docs/INSTRUMENTATION-REQUIREMENTS.md) mapped
 * to plain-language names. Call sites still write the terse "P1.2" ids in copy;
 * we translate them at render so a user never sees a raw ticket code — they read
 * "evaluation / quality scores" instead of "P1.2" (PLS-12). The raw code is kept
 * available on hover (title) for inline text and in parentheses in the tooltip.
 */
const REQUIREMENT_NAMES: Record<string, string> = {
  "P0.1": "trace-context propagation across the LLM proxy",
  "P0.2": "proxy-span resilience (non-null IDs + Bedrock/boto3 coverage)",
  "P1.1": "session / user / conversation identity",
  "P1.2": "evaluation / quality scores",
  "P1.3": "tool & MCP semantic attributes",
  "P1.4": "cost & token completeness",
  "P1.5": "time-to-first-token & latency split",
  "P2.1": "retrieval / vector-DB attributes",
  "P2.2": "privacy & guardrail attributes",
  "P2.3": "error-taxonomy attributes",
  "P2.4": "agent loop counters & framework tag",
  "P2.5": "retry / throttle signals",
  "P2.6": "structured prompt / response messages",
  "P2.7": "business-outcome linkage",
};

/** Plain name for a requirement code, falling back to the raw code if unknown. */
const reqName = (code: string): string => REQUIREMENT_NAMES[code] ?? code;

/**
 * Render a message with any raw P-codes swapped for their plain requirement
 * name, keeping the raw code available on hover (title). No-op (returns the
 * original string) when the text contains no codes, so existing copy renders
 * byte-identically.
 */
const renderWithReqNames = (text: string): React.ReactNode => {
  const parts = text.split(/(P\d+\.\d+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^P\d+\.\d+$/.test(part) ? (
      <span key={i} title={part}>
        {reqName(part)}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
};

/**
 * Rewrite best-practice tooltip copy to read in plain language:
 *  - drop the internal "See INSTRUMENTATION-REQUIREMENTS.md …" doc reference
 *    (users can't open that file; the visible "Full instrumentation checklist →"
 *    link now handles navigation),
 *  - expand any P-code — parenthesised "(P1.2)" becomes "(evaluation / quality
 *    scores)"; a bare code keeps its id in parentheses as "<name> (P1.2)".
 */
const humanizeBestPractice = (text: string): string =>
  text
    // Strip the whole trailing "See INSTRUMENTATION-REQUIREMENTS.md P1.5 / …."
    // clause. The class after `.md` spans a code list (codes carry an internal
    // dot, plus " / ", ", ", and the word "and") up to the sentence end.
    .replace(/\s*See\s+INSTRUMENTATION-REQUIREMENTS\.md[\sP0-9./,and]*\.?\s*$/i, "")
    .replace(/INSTRUMENTATION-REQUIREMENTS\.md/gi, "the instrumentation checklist")
    .replace(/\(\s*(P\d+\.\d+)\s*\)/g, (_m, code: string) => `(${reqName(code)})`)
    .replace(/P\d+\.\d+/g, (code) => `${reqName(code)} (${code})`)
    .trim();

/**
 * Inline "this is limited by missing instrumentation" callout.
 *
 * Used wherever a feature can't fully work because the AI workload isn't
 * emitting an attribute (a 🟥 data gap). Keeps the UI honest: instead of a
 * silently-empty or misleading widget, it names exactly which attribute(s) are
 * missing and what the best practice is, with an optional vendor-neutral doc
 * link. Deliberately small and unobtrusive (it documents a gap, it isn't an
 * error).
 *
 * Variants:
 *   - "inline"  (default) — tiny single-line note under/inside a widget
 *   - "banner"           — slightly more prominent boxed strip for section tops
 */
export interface DataGapNoteProps {
  /** Short message: what is limited and why. */
  message: string;
  /** Missing attribute path(s), rendered as code chips. */
  attributes?: string[];
  /** Longer best-practice guidance shown in an info tooltip. */
  bestPractice?: string;
  /** Vendor-neutral "learn more" link (OpenTelemetry / MCP spec, etc.). */
  href?: string;
  hrefLabel?: string;
  tone?: "info" | "warn";
  variant?: "inline" | "banner";
  style?: React.CSSProperties;
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code
    style={{
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      fontSize: "0.92em",
      padding: "0 4px",
      borderRadius: 4,
      background: "color-mix(in oklab, var(--text-3) 14%, transparent)",
      color: "var(--text-2)",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </code>
);

export const DataGapNote = ({
  message,
  attributes,
  bestPractice,
  href,
  hrefLabel = "Best practice",
  tone = "info",
  variant = "inline",
  style,
}: DataGapNoteProps) => {
  const color = tone === "warn" ? "var(--amber)" : "var(--text-3)";
  const Icon = tone === "warn" ? WarningIcon : InformationIcon;

  const body = (
    <Flex
      alignItems="center"
      gap={6}
      style={{
        flexWrap: "wrap",
        rowGap: 2,
        ...(variant === "banner"
          ? {
              padding: "6px 10px",
              borderRadius: 8,
              background: `color-mix(in oklab, ${color} 8%, var(--surface))`,
              border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
            }
          : {}),
        ...style,
      }}
    >
      <Icon size={12} style={{ color, flex: "0 0 auto" }} />
      <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.45 }}>
        {renderWithReqNames(message)}
        {attributes && attributes.length > 0 && (
          <>
            {" "}
            {attributes.map((a, i) => (
              <React.Fragment key={a}>
                {i > 0 && ", "}
                <Code>{a}</Code>
              </React.Fragment>
            ))}
          </>
        )}
      </Text>
      {bestPractice && <InfoTooltip text={humanizeBestPractice(bestPractice)} />}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 10.5,
            color: "var(--blue)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <ExternalLinkIcon size={10} />
          {hrefLabel}
        </a>
      )}
      {/* IA-8: route users to the full, human-readable requirement list rather
          than leaving raw P-codes / an internal .md filename as the only pointer. */}
      <Link
        to={ATTRIBUTE_AUDIT_ROUTE}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 10.5,
          color: "var(--blue)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Full instrumentation checklist →
      </Link>
    </Flex>
  );

  return body;
};

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { InformationIcon, WarningIcon, ExternalLinkIcon } from "@dynatrace/strato-icons";
import { InfoTooltip } from "./InfoTooltip";

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
        {message}
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
      {bestPractice && <InfoTooltip text={bestPractice} />}
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
    </Flex>
  );

  return body;
};

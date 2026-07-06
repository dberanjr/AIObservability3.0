import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { InfoTooltip } from "./InfoTooltip";

export type StatTileEmphasis = "default" | "amber" | "red" | "green";

const EMPHASIS_COLOR: Record<StatTileEmphasis, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
  green: "var(--green-2)",
};

export interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  emphasis?: StatTileEmphasis;
  /** One-line definition shown via an info icon next to the label. */
  info?: string;
  /** When provided, the tile becomes clickable (filter / scroll / drill). */
  onActivate?: () => void;
  /** Accessible description of the click action (required when onActivate set). */
  actionLabel?: string;
  /** Optional chip naming the tile's time basis (e.g. "24h", "30d proj"). */
  window?: string;
  /** Extra content under the value (delta chip, sparkline, composition bar). */
  children?: React.ReactNode;
}

/**
 * The shared KPI stat tile — one primitive for the small label/value/sub cards
 * every page's tile row uses (previously a per-page copy). Raised Surface (the
 * app-wide floating shadow), optional info tooltip, an optional click action
 * with proper keyboard + aria semantics, an optional time-basis window chip,
 * and a children slot for a delta / sparkline / bar. Complex tiles with bespoke
 * visuals (Summary/Pulse) keep their own components.
 */
export const StatTile = ({
  label,
  value,
  sub,
  emphasis = "default",
  info,
  onActivate,
  actionLabel,
  window,
  children,
}: StatTileProps) => {
  const interactive = !!onActivate;
  return (
    <Surface
      elevation="raised"
      padding={12}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": actionLabel,
            className: "aiobs-clickable-tile",
            onClick: onActivate,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate?.();
              }
            },
          }
        : {})}
    >
      <Flex flexDirection="column" gap={4}>
        <Flex
          alignItems="center"
          gap={4}
          justifyContent="space-between"
          style={{ minHeight: 28 }}
        >
          <Flex alignItems="center" gap={4} style={{ minWidth: 0 }}>
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text-3)",
                whiteSpace: "normal",
                lineHeight: 1.2,
              }}
            >
              {label}
            </Text>
            {info && (
              <span
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ display: "inline-flex", flex: "0 0 auto" }}
              >
                <InfoTooltip text={info} size={12} />
              </span>
            )}
          </Flex>
          {window && (
            <Text
              title="This tile's time basis"
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--text-3)",
                background: "var(--surface-2, var(--border))",
                borderRadius: 4,
                padding: "1px 5px",
                whiteSpace: "nowrap",
                flex: "0 0 auto",
              }}
            >
              {window}
            </Text>
          )}
        </Flex>
        <Text
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: EMPHASIS_COLOR[emphasis],
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {value}
        </Text>
        {sub && <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>}
        {children}
      </Flex>
    </Surface>
  );
};

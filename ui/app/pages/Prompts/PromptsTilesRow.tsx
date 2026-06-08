import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtTokens } from "../../data/format";
import type { PromptSummary } from "./usePromptSummary";
import type { PromptsFilter } from "./usePrompts";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "amber" | "red";
  /** When set, the tile becomes a toggle button that filters the list. */
  onClick?: () => void;
  active?: boolean;
}

const COLOR: Record<NonNullable<TileProps["emphasis"]>, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
};

const Tile = ({ label, value, sub, emphasis = "default", onClick, active }: TileProps) => {
  const interactive = !!onClick;
  return (
    <Surface elevation="raised" padding={0}>
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-pressed={interactive ? !!active : undefined}
        title={interactive ? "Click to filter the list" : undefined}
        style={{
          all: "unset",
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          padding: 12,
          cursor: interactive ? "pointer" : "default",
          borderRadius: 8,
          outline: active ? "2px solid var(--blue)" : "none",
          outlineOffset: -2,
          background: active
            ? "color-mix(in oklab, var(--blue) 8%, transparent)"
            : "transparent",
        }}
      >
        <Flex flexDirection="column" gap={4}>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              minHeight: 28,
              whiteSpace: "normal",
              lineHeight: 1.2,
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: COLOR[emphasis],
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {value}
          </Text>
          {sub && <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>}
        </Flex>
      </button>
    </Surface>
  );
};

export interface PromptsTilesRowProps {
  summary: PromptSummary;
  filter?: PromptsFilter;
  onFilterChange?: (next: PromptsFilter) => void;
}

export const PromptsTilesRow = ({
  summary,
  filter,
  onFilterChange,
}: PromptsTilesRowProps) => {
  if (summary.isLoading && summary.total === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <Surface key={i} elevation="raised" padding={12}>
            <Flex flexDirection="column" gap={6}>
              <Skeleton style={{ height: 12, width: "60%" }} />
              <Skeleton style={{ height: 22, width: "80%" }} />
            </Flex>
          </Surface>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      <Tile
        label="Prompts"
        value={fmtCount(summary.total)}
        sub={`${fmtCount(summary.sampleSize)} shown`}
      />
      <Tile
        label="Avg duration"
        value={fmtMs(summary.avgDurationMs)}
        onClick={
          onFilterChange && filter && summary.avgDurationMs > 0
            ? () =>
                onFilterChange(
                  filter.latency?.op === "gt"
                    ? { ...filter, latency: undefined }
                    : {
                        ...filter,
                        latency: {
                          op: "gt",
                          min: Math.round(summary.avgDurationMs),
                        },
                      },
                )
            : undefined
        }
        active={filter?.latency?.op === "gt"}
        sub="click: slower than avg"
      />
      <Tile
        label="Avg in/out tokens"
        value={`${fmtTokens(summary.avgInputTokens)} / ${fmtTokens(summary.avgOutputTokens)}`}
      />
      <Tile
        label="PII detected"
        value={fmtCount(summary.piiDetected)}
        emphasis={summary.piiDetected > 0 ? "amber" : "default"}
        sub="gen_ai.privacy.pii_detected"
        onClick={
          onFilterChange && filter
            ? () => onFilterChange({ ...filter, onlyPii: filter.onlyPii ? undefined : true })
            : undefined
        }
        active={!!filter?.onlyPii}
      />
      <Tile
        label="Warnings"
        value={fmtCount(summary.warnings)}
        emphasis={summary.warnings > 0 ? "amber" : "default"}
        onClick={
          onFilterChange && filter
            ? () =>
                onFilterChange({
                  ...filter,
                  onlyWarnings: filter.onlyWarnings ? undefined : true,
                })
            : undefined
        }
        active={!!filter?.onlyWarnings}
      />
      <Tile
        label="Errors"
        value={fmtCount(summary.errors)}
        emphasis={summary.errors > 5 ? "red" : summary.errors > 0 ? "amber" : "default"}
        onClick={
          onFilterChange && filter
            ? () =>
                onFilterChange({
                  ...filter,
                  onlyErrors: filter.onlyErrors ? undefined : true,
                })
            : undefined
        }
        active={!!filter?.onlyErrors}
      />
      <Tile
        label="Truncated"
        value={fmtCount(summary.truncated)}
        emphasis={summary.truncated > 0 ? "amber" : "default"}
        sub="finish_reasons: max_tokens"
        onClick={
          onFilterChange && filter
            ? () =>
                onFilterChange({
                  ...filter,
                  onlyTruncated: filter.onlyTruncated ? undefined : true,
                })
            : undefined
        }
        active={!!filter?.onlyTruncated}
      />
    </div>
  );
};

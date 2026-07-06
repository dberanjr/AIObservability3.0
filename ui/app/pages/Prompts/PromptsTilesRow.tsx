import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtTokens } from "../../data/format";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ScanScopedTile } from "../../scope/ScanScopedTile";
import { useEditLayout } from "../../layout/EditLayoutContext";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { usePromptSummary } from "./usePromptSummary";
import { isScopeFiltered } from "./filterScope";
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
  filter?: PromptsFilter;
  onFilterChange?: (next: PromptsFilter) => void;
  /** Active problem-pattern focus (raw `?focus`) — scopes the totals (Prompts-2). */
  focus?: string | null;
}

const ScopeCaption = () => (
  <Text style={{ fontSize: 11, color: "var(--text-3)", padding: "0 16px 12px" }}>
    Totals reflect the current scope. Free-text search and agent filters aren't
    applied here, so the list below may be a narrower subset.
  </Text>
);

// Body owns the query (usePromptSummary) so it only runs while the section is
// expanded — CollapsibleCard renders children solely when open. Threads the
// sidebar filter + focus so the tiles respond to the same scope as the list
// (Prompts-2).
const PromptsTilesBody = ({ filter, onFilterChange, focus }: PromptsTilesRowProps) => {
  const summary = usePromptSummary(filter, focus);
  const filtered = isScopeFiltered(filter, focus);
  // The KPI row is user-customizable (drag to reorder, drag a corner to resize)
  // via the shared CustomizableGrid, revealed by the global header "Customize"
  // toggle. Seven equal tiles → columns=7, defaultColSpan=1 each, so the calm
  // (non-editing) view keeps the exact one-row, equal-width layout.
  const { editLayout } = useEditLayout();
  if (summary.isLoading && summary.total === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 10,
          padding: 16,
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

  // Each KPI keeps its exact content/props — only placement moves to the grid.
  const tiles: GridTile[] = [
    {
      id: "prompts",
      defaultColSpan: 1,
      node: (
        <Tile
          label="Prompts"
          value={fmtCount(summary.total)}
          sub={`${fmtCount(summary.sampleSize)} shown`}
        />
      ),
    },
    {
      id: "avg-duration",
      defaultColSpan: 1,
      node: (
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
      ),
    },
    {
      id: "avg-tokens",
      defaultColSpan: 1,
      node: (
        <Tile
          label="Avg in/out tokens"
          value={`${fmtTokens(summary.avgInputTokens)} / ${fmtTokens(summary.avgOutputTokens)}`}
        />
      ),
    },
    {
      id: "pii",
      defaultColSpan: 1,
      node: (
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
      ),
    },
    {
      id: "warnings",
      defaultColSpan: 1,
      node: (
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
      ),
    },
    {
      id: "errors",
      defaultColSpan: 1,
      node: (
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
      ),
    },
    {
      id: "truncated",
      defaultColSpan: 1,
      node: (
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
      ),
    },
  ];

  return (
    <>
    <div style={{ padding: 16 }}>
      <CustomizableGrid
        storageKey="prompts-kpis"
        columns={7}
        tiles={tiles}
        editable={editLayout}
      />
    </div>
    {filtered && <ScopeCaption />}
    </>
  );
};

export const PromptsTilesRow = (props: PromptsTilesRowProps) => (
  <CollapsibleCard title="Prompt overview" defaultOpen>
    {/* One shared scope: usePromptSummary runs once in the body and feeds all
        seven KPI tiles, so the scan is attributed at the row level. */}
    <ScanScopedTile name="Prompt overview">
      <PromptsTilesBody {...props} />
    </ScanScopedTile>
  </CollapsibleCard>
);

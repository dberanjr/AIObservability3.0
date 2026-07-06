import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtTokens } from "../../data/format";
import {
  statusColor,
  STATUS_CUE,
  type SemanticStatus,
} from "../../theme/statusColor";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ScanScopedTile } from "../../scope/ScanScopedTile";
import { useEditLayout } from "../../layout/EditLayoutContext";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { usePromptSummary } from "./usePromptSummary";
import { isScopeFiltered } from "./filterScope";
import { countSeverity } from "./promptCells";
import type { PromptsFilter } from "./usePrompts";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  /**
   * Severity of the tile's value, routed through the shared statusColor +
   * STATUS_CUE vocabulary so it is never encoded by color alone: a non-"neutral"
   * status prints a small glyph cue (▲ warning / ⬤ critical) next to the value.
   */
  status?: SemanticStatus;
  /** When set, the tile becomes a toggle button that filters the list. */
  onClick?: () => void;
  active?: boolean;
}

const Tile = ({
  label,
  value,
  sub,
  status = "neutral",
  onClick,
  active,
}: TileProps) => {
  const interactive = !!onClick;
  // Neutral keeps the full-strength text color; a real status tints the value
  // AND is announced via the glyph's aria-label (non-color cue).
  const valueColor = status === "neutral" ? "var(--text)" : statusColor(status);
  return (
    <Surface elevation="raised" padding={0}>
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-pressed={interactive ? !!active : undefined}
        title={interactive ? "Click to filter the list" : undefined}
        // Shared clickable-tile class restores a keyboard :focus-visible ring
        // (the `all: unset` reset strips the default outline) and the app-wide
        // hover lift, matching every other clickable KPI tile.
        className={interactive ? "aiobs-clickable-tile" : undefined}
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
          <Flex alignItems="center" gap={4} style={{ minWidth: 0 }}>
            {status !== "neutral" && (
              <span
                role="img"
                aria-label={STATUS_CUE[status].label}
                style={{
                  fontSize: 12,
                  lineHeight: 1,
                  color: valueColor,
                  flex: "0 0 auto",
                }}
              >
                {STATUS_CUE[status].glyph}
              </span>
            )}
            <Text
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: valueColor,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {value}
            </Text>
          </Flex>
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
          status={countSeverity(summary.piiDetected)}
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
          status={countSeverity(summary.warnings)}
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
          status={countSeverity(summary.errors, 5)}
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
          status={countSeverity(summary.truncated)}
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

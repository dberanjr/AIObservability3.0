import React from "react";
import { Text } from "@dynatrace/strato-components/typography";
import { fmtCount, fmtMs, fmtTokens } from "../../data/format";
import type { SemanticStatus } from "../../theme/statusColor";
import { StatTile, type StatTileTone } from "../../components/StatTile";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ScanScopedTile } from "../../scope/ScanScopedTile";
import { useEditLayout } from "../../layout/EditLayoutContext";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { usePromptSummary } from "./usePromptSummary";
import { isScopeFiltered } from "./filterScope";
import { countSeverity } from "./promptCells";
import type { PromptsFilter } from "./usePrompts";

/** countSeverity's SemanticStatus → StatTile's tone vocabulary. countSeverity
 *  only ever emits neutral / warning / critical; `good`/`info` are mapped too
 *  so the type stays total. */
const STATUS_TONE: Record<SemanticStatus, StatTileTone> = {
  neutral: "neutral",
  good: "good",
  info: "neutral",
  warning: "warn",
  critical: "bad",
};

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  /**
   * Severity of the tile's value, routed through the shared status vocabulary
   * so it is never encoded by color alone: a non-"neutral" status prints a
   * small glyph cue (▲ warning / ⬤ critical) next to the value via StatTile.
   */
  status?: SemanticStatus;
  /** One-line definition surfaced through StatTile's info tooltip (CONS-5). */
  info?: React.ReactNode;
  /** When set, the tile becomes a toggle button that filters the list. */
  onClick?: () => void;
  active?: boolean;
}

// Thin adapter over the shared StatTile (CONS-2 / IA-4) so the Prompts KPI row
// no longer forks its own tile: tone + non-color cue glyph, the info tooltip,
// and the click/toggle affordance all come from the one primitive.
const Tile = ({ label, value, sub, status = "neutral", info, onClick, active }: TileProps) => {
  const tone = STATUS_TONE[status];
  return (
    <StatTile
      label={label}
      value={value}
      sub={sub}
      tone={tone}
      cue={tone !== "neutral"}
      info={info}
      onClick={onClick}
      active={active}
      actionLabel={onClick ? "Click to filter the list" : undefined}
    />
  );
};

export interface PromptsTilesRowProps {
  filter?: PromptsFilter;
  onFilterChange?: (next: PromptsFilter) => void;
  /** Active problem-pattern focus (raw `?focus`) — scopes the totals (Prompts-2). */
  focus?: string | null;
  /** True to render the bundled Demo Mode totals instead of querying Grail. */
  showExample?: boolean;
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
const PromptsTilesBody = ({ filter, onFilterChange, focus, showExample }: PromptsTilesRowProps) => {
  const summary = usePromptSummary(filter, focus, showExample);
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
          gap: "var(--d-gap)",
          padding: "var(--d-gap)",
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <StatTile key={i} loading label="" value="" />
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
          info="Prompts flagged as containing personally identifiable information (gen_ai.privacy.pii_detected = true)."
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
          info="Prompts the provider returned a non-fatal warning for (gen_ai.response.warning = true)."
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
          info="Responses cut off at the model's output-token limit (finish_reason = max_tokens)."
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
    <div style={{ padding: "var(--d-gap)" }}>
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

import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  fmtCount,
  fmtPercent,
  fmtTokens,
} from "../../data/format";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { InfoTooltip } from "../../components/InfoTooltip";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useEditLayout } from "../../layout/EditLayoutContext";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import type { ExplorerSummary } from "./useExplorerSummary";
import { tileAction, type TileAction } from "./tileActions";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "amber" | "red";
  /** Optional one-line definition shown via an info icon next to the label. */
  info?: string;
  /** When provided, the tile becomes clickable (filter or scroll). */
  onActivate?: () => void;
  /** Accessible description of the click action (required when onActivate set). */
  actionLabel?: string;
}

const COLOR: Record<NonNullable<TileProps["emphasis"]>, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
};

const Tile = ({
  label,
  value,
  sub,
  emphasis = "default",
  info,
  onActivate,
  actionLabel,
}: TileProps) => {
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
      <Flex alignItems="center" gap={4} style={{ minHeight: 28 }}>
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
          // Stop clicks/keys on the tooltip from also triggering the tile's
          // scroll/filter action.
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            style={{ display: "inline-flex", flex: "0 0 auto" }}
          >
            <InfoTooltip text={info} size={12} />
          </span>
        )}
      </Flex>
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
      {sub && (
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
      )}
    </Flex>
  </Surface>
  );
};

export interface ExplorerTilesProps {
  summary: ExplorerSummary;
  isLoading: boolean;
  /** Force a target section open and scroll to it (falls back to a plain
   *  scroll). Provided by ExplorerPage, which owns the sections' open state. */
  onRevealSection?: (id: string) => void;
}

/** Fallback smooth-scroll to a section by element id when no reveal handler is
 *  supplied (the wrapper div is always in the DOM regardless of collapse). */
const scrollToSection = (id: string) => {
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const ExplorerTilesBody = ({
  summary,
  isLoading,
  onRevealSection,
}: ExplorerTilesProps) => {
  const { upsertCondition } = useGlobalFilters();
  // Layout customization is opt-in and driven by the global header "Customize"
  // toggle, so the KPI row can be reordered / resized from every page.
  const { editLayout } = useEditLayout();
  const reveal = onRevealSection ?? scrollToSection;

  /** Convert a tile action into Tile activation props (or none). */
  const activation = (
    action: TileAction,
  ): { onActivate?: () => void; actionLabel?: string } => {
    if (action.kind === "filter") {
      return {
        actionLabel: action.aria,
        onActivate: () => upsertCondition(action.attribute, action.values),
      };
    }
    if (action.kind === "scroll") {
      return {
        actionLabel: action.aria,
        onActivate: () => reveal(action.section),
      };
    }
    return {};
  };

  // Fleet error rate drives both the value and the severity emphasis, so a large
  // absolute count with a tiny rate no longer reads as alarming (Explorer-6).
  const errorRatePct =
    summary.llmRequests > 0 ? (summary.errors / summary.llmRequests) * 100 : 0;
  const errorEmphasis: TileProps["emphasis"] =
    errorRatePct > 5 ? "red" : errorRatePct > 1 ? "amber" : "default";

  if (isLoading && summary.tokens === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 10,
          padding: 12,
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

  // The seven KPIs become a user-customizable grid (reorder + resize) revealed
  // by the global "Customize" toggle. A 7-column grid with each tile spanning 1
  // column reproduces the previous `repeat(7, 1fr)` layout exactly when not
  // editing; each Tile keeps its identical content/props.
  const tiles: GridTile[] = [
    {
      id: "aiServices",
      defaultColSpan: 1,
      node: (
        <Tile
          label="AI services"
          value={fmtCount(summary.aiServiceCount)}
          {...activation(tileAction("aiServices", summary))}
        />
      ),
    },
    {
      id: "llmRequests",
      defaultColSpan: 1,
      node: (
        <Tile
          label="LLM requests"
          value={fmtCount(summary.llmRequests)}
          {...activation(tileAction("llmRequests", summary))}
        />
      ),
    },
    {
      id: "tokens",
      defaultColSpan: 1,
      node: (
        <Tile
          label="Tokens"
          value={fmtTokens(summary.tokens)}
          {...activation(tileAction("tokens", summary))}
        />
      ),
    },
    {
      id: "activeModels",
      defaultColSpan: 1,
      node: (
        <Tile
          label="Active models"
          value={fmtCount(summary.activeModels)}
          info="Distinct models (canonicalized) seen across all AI services in scope."
          {...activation(tileAction("activeModels", summary))}
        />
      ),
    },
    {
      id: "concentration",
      defaultColSpan: 1,
      node: (
        <Tile
          label="Concentration"
          value={fmtPercent(summary.concentrationPct, 0)}
          sub={summary.topServiceShare?.service}
          emphasis={summary.concentrationPct > 50 ? "amber" : "default"}
          info="Share of fleet tokens consumed by the single largest service — high values mean spend is concentrated in one service."
          {...activation(tileAction("concentration", summary))}
        />
      ),
    },
    {
      id: "errors",
      defaultColSpan: 1,
      node: (
        <Tile
          label="Errors"
          value={fmtPercent(errorRatePct)}
          sub={`${fmtCount(summary.errors)} ${summary.errors === 1 ? "error" : "errors"}`}
          emphasis={errorEmphasis}
          info="Share of LLM spans in scope with an error status. Neutral <1%, amber 1–5%, red >5% — matching the per-service status dots."
          {...activation(tileAction("errors", summary))}
        />
      ),
    },
    {
      id: "logicalErrors",
      defaultColSpan: 1,
      node: (
        <Tile
          label="Logical errors"
          value={fmtCount(summary.logicalErrors)}
          sub="HTTP 200, payload-level"
          emphasis={summary.logicalErrors > 0 ? "amber" : "default"}
          info="HTTP 200 responses that still failed at the payload level — truncated output (max_tokens), content filter, or refusal."
          {...activation(tileAction("logicalErrors", summary))}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: 12 }}>
      <CustomizableGrid
        storageKey="explorer-kpis"
        columns={7}
        tiles={tiles}
        editable={editLayout}
      />
    </div>
  );
};

export const ExplorerTiles = (props: ExplorerTilesProps) => (
  <CollapsibleCard title="Overview" defaultOpen>
    <ExplorerTilesBody {...props} />
  </CollapsibleCard>
);

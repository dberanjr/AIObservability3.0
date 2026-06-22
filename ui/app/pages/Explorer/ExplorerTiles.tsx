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
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import type { ExplorerSummary } from "./useExplorerSummary";
import { tileAction, type TileAction } from "./tileActions";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "amber" | "red";
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
}

/** Smooth-scroll to a section by element id, expanding nothing (cards manage
 *  their own collapse state; the wrapper div is always in the DOM). */
const scrollToSection = (id: string) => {
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const ExplorerTilesBody = ({ summary, isLoading }: ExplorerTilesProps) => {
  const { upsertCondition } = useGlobalFilters();

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
        onActivate: () => scrollToSection(action.section),
      };
    }
    return {};
  };

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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 10,
        padding: 12,
      }}
    >
      <Tile
        label="AI services"
        value={fmtCount(summary.aiServiceCount)}
        {...activation(tileAction("aiServices", summary))}
      />
      <Tile
        label="LLM requests"
        value={fmtCount(summary.llmRequests)}
        {...activation(tileAction("llmRequests", summary))}
      />
      <Tile
        label="Tokens"
        value={fmtTokens(summary.tokens)}
        {...activation(tileAction("tokens", summary))}
      />
      <Tile
        label="Active models"
        value={fmtCount(summary.activeModels)}
        {...activation(tileAction("activeModels", summary))}
      />
      <Tile
        label="Concentration"
        value={fmtPercent(summary.concentrationPct, 0)}
        sub={summary.topServiceShare?.service}
        emphasis={summary.concentrationPct > 50 ? "amber" : "default"}
        {...activation(tileAction("concentration", summary))}
      />
      <Tile
        label="Errors"
        value={fmtCount(summary.errors)}
        emphasis={summary.errors > 0 ? "amber" : "default"}
        {...activation(tileAction("errors", summary))}
      />
      <Tile
        label="Logical errors"
        value={fmtCount(summary.logicalErrors)}
        sub="HTTP 200, payload-level"
        emphasis={summary.logicalErrors > 0 ? "amber" : "default"}
        {...activation(tileAction("logicalErrors", summary))}
      />
    </div>
  );
};

export const ExplorerTiles = (props: ExplorerTilesProps) => (
  <CollapsibleCard title="Overview" defaultOpen>
    <ExplorerTilesBody {...props} />
  </CollapsibleCard>
);

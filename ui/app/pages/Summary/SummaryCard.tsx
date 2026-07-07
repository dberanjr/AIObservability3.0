import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useTabNav, type FocusParam } from "../../lib/nav";
import { useScanScope } from "../../scope/ScanReportContext";
import { useCanQueryScope } from "../../scope/useResolvedServices";
import { InfoTooltip } from "../../components/InfoTooltip";
import { EmptyState } from "../../components/EmptyState";
import { TileScanFooter } from "../../scope/TileScanFooter";
import { SUMMARY_SCAN_OPTS } from "./summaryScanGroups";
import { CollapseButton, useTileCollapse } from "./CollapsibleTile";

export interface SummaryCardDrill {
  /** Text shown in the top-right affordance (e.g. "Agents"). */
  label: string;
  /** Destination route, e.g. "/agents". */
  to: string;
  /** Optional pre-filter focus applied at the destination. */
  focus?: FocusParam;
}

export interface SummaryCardProps {
  /** Uppercase micro-title (mock uses monospace eyebrow labels). */
  title: string;
  /** One-line, plain-language definition shown via an info icon by the title. */
  info?: string;
  subtitle?: string;
  /** Top-right drill affordance — the tile's entry point into its owning tab. */
  drill?: SummaryCardDrill;
  /** Extra node rendered in the header row (e.g. a badge). */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Shared Summary tile chrome: a raised Surface with an uppercase eyebrow title
 * and an optional "→ Tab" drill affordance in the top-right. Every tile on the
 * Summary page is both a live KPI and an entry point into the tab that owns the
 * detail — the drill routes through the same `useTabNav` the Pulse map and the
 * top nav use, so the timeframe/query string is preserved.
 */
export const SummaryCard = ({
  title,
  info,
  subtitle,
  drill,
  headerRight,
  children,
  style,
}: SummaryCardProps) => {
  const goToTab = useTabNav();
  const scanGroup = useScanScope();
  const collapse = useTileCollapse();
  // Shared no-scope guard (SUM-9): when the scope can't be resolved into a
  // query, every card shows one consistent "select a scope" state instead of
  // its own "No X in scope" one-liner — which would read as a real zero even
  // though nothing was ever queried. Defensive today (canQueryScope is always
  // true), but keeps the whole page honest if scope resolution returns.
  const canQuery = useCanQueryScope();
  // Summary cards render as comfortable floating cards (see the Summary
  // floating-card shadow in tokens.ts) with a fixed padding.
  const pad = 16;

  return (
    <Surface
      elevation="raised"
      padding={pad}
      style={{
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // Clip inner content so a user-resized (shortened) tile never spills
        // onto its neighbour; the shadow lives on the grid wrapper, unclipped.
        overflow: "hidden",
        ...style,
      }}
    >
      <Flex
        alignItems="center"
        justifyContent="space-between"
        gap={8}
        style={{ marginBottom: 12, minHeight: 20 }}
      >
        <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
          <Flex alignItems="center" gap={4} style={{ minWidth: 0 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {title}
            </Text>
            {info && <InfoTooltip text={info} size={13} />}
          </Flex>
          {subtitle && (
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              {subtitle}
            </Text>
          )}
        </Flex>
        <Flex alignItems="center" gap={8} style={{ flex: "0 0 auto" }}>
          {headerRight}
          {drill && (
            <button
              type="button"
              onClick={() =>
                goToTab(drill.to, drill.focus ? { focus: drill.focus } : undefined)
              }
              className="aiobs-summary-drill"
              aria-label={`Go to ${drill.label}`}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--primary, var(--blue))",
                whiteSpace: "nowrap",
              }}
            >
              {drill.label} →
            </button>
          )}
          {collapse && (
            <CollapseButton
              open
              label={`Collapse ${collapse.title}`}
              onClick={collapse.toggle}
            />
          )}
        </Flex>
      </Flex>
      <div style={{ flex: 1, minHeight: 0 }}>
        {canQuery ? children : <EmptyState bare cause="no-scope" fill />}
      </div>
      <TileScanFooter group={scanGroup} opts={SUMMARY_SCAN_OPTS} />
    </Surface>
  );
};

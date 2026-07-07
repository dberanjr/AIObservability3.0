/**
 * P90-latency-over-time chart for the Pulse "upstream services" detail
 * modal. Shows one line per upstream caller (top 8 by request volume by
 * default, or every caller with "Show all"), always keeping the
 * table-selected caller visible even if it falls outside the top 8.
 * Callers that are neither in the visible set nor selected collapse into a
 * single faint "Others (N)" context line so the chart never goes fully
 * silent about the long tail.
 */
import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { AreaChart, type AreaSeries } from "../../../components/charts/AreaChart";
import { CATEGORICAL } from "../../../theme/palette";
import { fmtMs } from "../../../data/format";
import { topCallersByVolume, type UpstreamCaller } from "./upstreamGraph";

/**
 * Element-wise mean across a list of per-caller series, ignoring nulls at
 * each bucket independently (a caller with a gap at bucket i just doesn't
 * contribute to that bucket's average). A bucket where every input is null
 * stays null so the resulting line doesn't fabricate a flat zero.
 */
export const meanSeries = (seriesList: (number | null)[][]): (number | null)[] => {
  const length = seriesList.reduce((max, s) => Math.max(max, s.length), 0);
  const out: (number | null)[] = [];
  for (let i = 0; i < length; i++) {
    let sum = 0;
    let count = 0;
    for (const s of seriesList) {
      const v = s[i];
      if (v != null && Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
    out.push(count > 0 ? sum / count : null);
  }
  return out;
};

// p90Series values come straight off the DQL result as raw nanoseconds
// (see useUpstreamDetail.ts — the map is built from `r.p90ns` with no
// division). fmtMs / the chart's left axis expect milliseconds, so every
// series here divides by 1e6 exactly once at read time.
const toMsSeries = (raw: (number | null)[]): (number | null)[] =>
  raw.map((v) => (v == null ? null : v / 1_000_000));

const dim = (color: string): string => `color-mix(in oklab, ${color} 25%, transparent)`;

export interface UpstreamP90ChartProps {
  callers: UpstreamCaller[];
  p90Series: Map<string, (number | null)[]>;
  labels: string[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** P90-over-time chart for upstream callers: top-8 + always-visible
 *  selection + a collapsed "Others" line for everyone else. */
export const UpstreamP90Chart = ({
  callers,
  p90Series,
  labels,
  selectedId,
}: UpstreamP90ChartProps) => {
  const [showAll, setShowAll] = useState(false);

  const visibleCallers = useMemo(() => {
    const ids = showAll
      ? new Set(callers.map((c) => c.id))
      : topCallersByVolume(callers, 8);
    if (selectedId) ids.add(selectedId);
    // Sort by volume desc so color assignment (by index) is stable across
    // the showAll toggle and doesn't reshuffle every line's color.
    return callers.filter((c) => ids.has(c.id)).sort((a, b) => b.requests - a.requests);
  }, [callers, showAll, selectedId]);

  const others = useMemo(() => {
    const visibleIds = new Set(visibleCallers.map((c) => c.id));
    return callers.filter((c) => !visibleIds.has(c.id));
  }, [callers, visibleCallers]);

  // Only fade when the selected caller actually exists among `callers` — a
  // stale selectedId (persisted across modal close/reopen, or a
  // timeframe/scope change that dropped the caller) must not fade every line.
  const hasSelection = selectedId != null && callers.some((c) => c.id === selectedId);

  const series: AreaSeries[] = useMemo(() => {
    const out: AreaSeries[] = visibleCallers.map((c, i) => {
      const baseColor = CATEGORICAL[i % CATEGORICAL.length];
      const faded = hasSelection && c.id !== selectedId;
      return {
        label: c.name,
        values: toMsSeries(p90Series.get(c.id) ?? []),
        color: faded ? dim(baseColor) : baseColor,
        axis: "left",
      };
    });
    if (others.length > 0) {
      out.push({
        label: `Others (${others.length})`,
        values: meanSeries(others.map((c) => toMsSeries(p90Series.get(c.id) ?? []))),
        color: "color-mix(in oklab, var(--text-3) 35%, transparent)",
        axis: "left",
      });
    }
    return out;
  }, [visibleCallers, others, p90Series, selectedId, hasSelection]);

  return (
    <Flex flexDirection="column" gap={8}>
      <Flex alignItems="baseline" justifyContent="space-between">
        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          P90 latency over time · per upstream caller
        </Text>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 11.5,
            color: "var(--blue)",
          }}
        >
          {showAll ? "Show top 8" : `Show all ${callers.length}`}
        </button>
      </Flex>
      <AreaChart
        series={series}
        formatLeft={fmtMs}
        xLabels={labels}
        ariaLabel="Upstream caller P90 latency over time"
      />
    </Flex>
  );
};

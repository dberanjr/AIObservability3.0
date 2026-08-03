import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { SR_ONLY } from "./AreaChart";

export interface StackedBarChartSeries {
  key: string;
  label: string;
  color: string;
  /** One value per bucket — aligned 1:1 with the chart's `labels` array. */
  values: number[];
}

export interface StackedBarChartProps {
  series: StackedBarChartSeries[];
  /** One label per bucket (e.g. a time-bucket string). Drives both the x-axis
   *  and the hover/keyboard tooltip header. */
  labels: string[];
  height?: number;
  /** Format a value for the y-axis ticks and tooltip rows. Default = grouped integer. */
  formatValue?: (n: number) => string;
  /**
   * Format a bucket label for the (narrow) x-axis row specifically — the
   * hover tooltip and keyboard readout always use the full label. Default:
   * for a "M/D HH:MM" label (governance's `bucketLabel`/`foldGovTimeseries`
   * sub-day format), show just the time; a day-or-longer "M/D" label (no
   * space) passes through unchanged — without it, a full "M/D HH:MM" label
   * gets clipped down to its first character or two in this chart's narrow
   * per-bucket box.
   */
  formatAxisLabel?: (label: string) => string;
  ariaLabel?: string;
}

const defaultAxisLabel = (label: string): string => {
  const spaceIdx = label.indexOf(" ");
  return spaceIdx === -1 ? label : label.slice(spaceIdx + 1);
};

const CHART_H_DEFAULT = 200;
const AXIS_W = 38;

/**
 * One column per bucket, each stacked bottom-up by series (in series order) —
 * the right form for a categorical breakdown over time when several series
 * are near-zero for long stretches (a multi-line/area chart makes those
 * series invisible under whichever one dominates; a stack still shows every
 * category's real share of each bucket). Mirrors BedrockCostChart's
 * interaction design (hover tooltip, keyboard nav, aria-live readout), plus
 * AreaChart's clickable legend (click a series to toggle it out of the
 * stack/scale/tooltip/keyboard readout — same isolate-one-series pattern),
 * so any categorical-over-time series can reuse it.
 */
export const StackedBarChart = ({
  series,
  labels,
  height = CHART_H_DEFAULT,
  formatValue = (n) => Math.round(n).toLocaleString("en-US"),
  formatAxisLabel = defaultAxisLabel,
  ariaLabel,
}: StackedBarChartProps) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [srText, setSrText] = useState("");
  // Series hidden via the clickable legend (keyed by `key`). The legend
  // itself always lists every series (so a hidden one stays clickable to
  // bring back) — only the stack/scale/tooltip/readout consult this.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const shownSeries = hidden.size > 0 ? series.filter((s) => !hidden.has(s.key)) : series;

  const bucketCount = labels.length;
  const totals = useMemo(
    () =>
      Array.from({ length: bucketCount }, (_, i) =>
        shownSeries.reduce((s, ser) => s + (ser.values[i] ?? 0), 0),
      ),
    [shownSeries, bucketCount],
  );
  const max = Math.max(0, ...totals);

  const readoutFor = (idx: number): string => {
    const label = labels[idx];
    const parts = [`${label}, total ${formatValue(totals[idx] ?? 0)}`];
    shownSeries
      .map((s) => ({ label: s.label, v: s.values[idx] ?? 0 }))
      .filter((p) => p.v > 0)
      .sort((a, b) => b.v - a.v)
      .forEach((p) => parts.push(`${p.label} ${formatValue(p.v)}`));
    return parts.join(", ");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = bucketCount;
    if (n === 0) return;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, (hoverIdx ?? -1) + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, (hoverIdx ?? n) - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setHoverIdx(null);
      setSrText("");
      return;
    } else return;
    e.preventDefault();
    setHoverIdx(next);
    setSrText(readoutFor(next));
  };

  const onBlur = () => {
    setHoverIdx(null);
    setSrText("");
  };

  const tipCenterPct =
    hoverIdx != null && bucketCount > 0 ? ((hoverIdx + 0.5) / bucketCount) * 100 : 50;
  const tipTx = tipCenterPct < 25 ? "0%" : tipCenterPct > 75 ? "-100%" : "-50%";

  // Thin the x-axis labels to ~10-12 so they don't overlap at high bucket counts.
  const axisLabelStep = Math.max(1, Math.ceil(bucketCount / 12));

  const accessibleLabel =
    (ariaLabel ?? "Stacked bar chart") +
    `, ${bucketCount} time buckets, ${formatValue(totals.reduce((s, v) => s + v, 0))} total. Use arrow keys to move between time buckets.`;

  return (
    <Flex flexDirection="column" gap={12}>
      <div
        role="img"
        aria-label={accessibleLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        style={{ position: "relative" }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", width: AXIS_W, height, flex: "0 0 auto" }}>
            {[1, 0.5, 0].map((f) => (
              <Text
                key={f}
                style={{
                  position: "absolute",
                  right: 4,
                  top: height * (1 - f) - 6,
                  fontSize: 9,
                  color: "var(--text-3)",
                  fontFamily: "var(--mono, monospace)",
                }}
              >
                {formatValue(max * f)}
              </Text>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            {[0, 0.5, 1].map((f) => (
              <div
                key={f}
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: height * (1 - f),
                  borderTop: "1px solid var(--border)",
                }}
              />
            ))}

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 4,
                height,
                position: "relative",
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {labels.map((label, idx) => {
                const total = totals[idx] ?? 0;
                return (
                  <div
                    key={label + idx}
                    onMouseEnter={() => setHoverIdx(idx)}
                    style={{
                      flex: "1 1 0",
                      minWidth: 4,
                      height,
                      display: "flex",
                      flexDirection: "column-reverse",
                      cursor: "pointer",
                      opacity: hoverIdx == null || hoverIdx === idx ? 1 : 0.5,
                    }}
                  >
                    {total > 0 &&
                      shownSeries.map((s) => {
                        const v = s.values[idx] ?? 0;
                        const px = max > 0 ? (v / max) * height : 0;
                        return px > 0 ? (
                          <div key={s.key} style={{ height: px, background: s.color }} />
                        ) : null;
                      })}
                  </div>
                );
              })}
            </div>

            {hoverIdx != null && labels[hoverIdx] != null && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 4,
                  left: `${tipCenterPct}%`,
                  transform: `translateX(${tipTx})`,
                  minWidth: 180,
                  padding: "8px 10px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.14))",
                  borderRadius: 6,
                  pointerEvents: "none",
                  zIndex: 2,
                  maxHeight: height,
                  overflowY: "auto",
                }}
              >
                <Flex flexDirection="column" gap={4}>
                  <Text style={{ fontSize: 11.5, fontWeight: 600 }}>{labels[hoverIdx]}</Text>
                  <Text style={{ fontSize: 11, color: "var(--text-2)" }}>
                    Total {formatValue(totals[hoverIdx] ?? 0)}
                  </Text>
                  {shownSeries
                    .map((s) => ({ ...s, v: s.values[hoverIdx] ?? 0 }))
                    .filter((s) => s.v > 0)
                    .sort((a, b) => b.v - a.v)
                    .map((s) => (
                      <Flex key={s.key} alignItems="center" gap={6}>
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: s.color,
                            flex: "0 0 auto",
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.label}
                        </Text>
                        <Text style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                          {formatValue(s.v)}
                        </Text>
                      </Flex>
                    ))}
                </Flex>
              </div>
            )}

            <div style={{ display: "flex", gap: 4, paddingTop: 4 }}>
              {labels.map((label, i) => (
                <Text
                  key={label + i}
                  style={{
                    flex: "1 1 0",
                    minWidth: 4,
                    fontSize: 9,
                    textAlign: "center",
                    color: hoverIdx === i ? "var(--text)" : "var(--text-3)",
                    fontFamily: "var(--mono, monospace)",
                  }}
                >
                  {i % axisLabelStep === 0 ? formatAxisLabel(label) : ""}
                </Text>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Flex gap={12} style={{ flexWrap: "wrap" }}>
        {series.map((s) => {
          const isHidden = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={!isHidden}
              title={isHidden ? `Show ${s.label}` : `Hide ${s.label}`}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.key)) next.delete(s.key);
                  else next.add(s.key);
                  return next;
                })
              }
              style={{
                all: "unset",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                borderRadius: 4,
                padding: "1px 2px",
                opacity: isHidden ? 0.45 : 1,
              }}
            >
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: "0 0 auto" }} />
              <Text
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  textDecoration: isHidden ? "line-through" : "none",
                }}
              >
                {s.label}
              </Text>
            </button>
          );
        })}
      </Flex>

      <div aria-live="polite" style={SR_ONLY}>
        {srText}
      </div>
    </Flex>
  );
};

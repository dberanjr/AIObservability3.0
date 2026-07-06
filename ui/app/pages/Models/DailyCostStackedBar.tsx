import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtUSDCompact } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import type { DailyCostSummary } from "./useFinOps";
import { assignSeriesColors } from "./finopsLogic";

const VIEW_W = 720;
const HEIGHT = 240;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 28;

const niceMax = (max: number): number => {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * exp;
};

export interface DailyCostStackedBarProps {
  daily: DailyCostSummary;
  isLoading: boolean;
}

export const DailyCostStackedBar = ({
  daily,
  isLoading,
}: DailyCostStackedBarProps) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { stacks, max, colorFor } = useMemo(() => {
    // Colour each model series by its provider so a model reads the same hue
    // here as in the bubble chart, table chips and provider-mix donut.
    const colorMap = assignSeriesColors(daily.series.map((s) => s.model));
    const max = niceMax(Math.max(...daily.totals, 0));
    const stacks = daily.totals.map((_, dayIdx) => {
      let running = 0;
      const segments = daily.series.map((s) => {
        const value = s.values[dayIdx] ?? 0;
        const start = running;
        running += value;
        return {
          model: s.model,
          value,
          start,
        };
      });
      return { segments, total: running };
    });
    return {
      stacks,
      max,
      colorFor: (model: string) => colorMap.get(model) ?? "var(--text-3)",
    };
  }, [daily]);

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_T - PAD_B;
  const slot = daily.dayLabels.length > 0 ? innerW / daily.dayLabels.length : innerW;
  const barW = Math.max(8, slot * 0.6);
  const yForValue = (v: number) => PAD_T + innerH - (v / max) * innerH;

  const hovered = hoverIndex != null ? stacks[hoverIndex] : null;
  const hoverLabel =
    hoverIndex != null ? daily.dayLabels[hoverIndex] : null;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Daily cost · last 7 days
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Stacked by model · top 6 by spend, remainder rolled into "Other"
            </Text>
          </Flex>
          <Flex gap={8} style={{ flexWrap: "wrap" }}>
            {daily.series.map((s) => (
              <Flex key={s.model} alignItems="center" gap={4}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: colorFor(s.model),
                  }}
                />
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {s.model}
                </Text>
              </Flex>
            ))}
          </Flex>
        </Flex>

        {isLoading && stacks.length === 0 ? (
          <Skeleton style={{ height: HEIGHT, borderRadius: 8 }} />
        ) : stacks.length === 0 ? (
          <EmptyState
            bare
            title="No spend over the last 7 days"
            description="No costable token usage was found in scope across the last 7 daily scans."
            hint="Each day is scanned at a 1:100 sampling floor; widen the scope or check that priced models are in use."
          />
        ) : (
          <div style={{ position: "relative" }}>
            <svg
              width="100%"
              height={HEIGHT}
              viewBox={`0 0 ${VIEW_W} ${HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Daily cost stacked bar chart"
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* Y axis grid + ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = yForValue(max * t);
                return (
                  <g key={t} pointerEvents="none">
                    <line
                      x1={PAD_L}
                      x2={VIEW_W - PAD_R}
                      y1={y}
                      y2={y}
                      stroke="var(--border)"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={PAD_L - 6}
                      y={y + 3}
                      fontSize={9}
                      textAnchor="end"
                      fill="var(--text-3)"
                      fontFamily="var(--mono, monospace)"
                    >
                      {fmtUSDCompact(max * t)}
                    </text>
                  </g>
                );
              })}

              {stacks.map((stack, dayIdx) => {
                const x = PAD_L + dayIdx * slot + (slot - barW) / 2;
                return (
                  <g
                    key={dayIdx}
                    onMouseEnter={() => setHoverIndex(dayIdx)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Invisible hit-area to make the whole column hoverable */}
                    <rect
                      x={PAD_L + dayIdx * slot}
                      y={PAD_T}
                      width={slot}
                      height={innerH}
                      fill="transparent"
                    />
                    {stack.segments.map((seg) => {
                      if (seg.value <= 0) return null;
                      const y1 = yForValue(seg.start + seg.value);
                      const y2 = yForValue(seg.start);
                      return (
                        <rect
                          key={seg.model}
                          x={x}
                          y={y1}
                          width={barW}
                          height={Math.max(1, y2 - y1)}
                          fill={colorFor(seg.model)}
                          opacity={
                            hoverIndex == null || hoverIndex === dayIdx
                              ? 1
                              : 0.4
                          }
                          pointerEvents="none"
                        />
                      );
                    })}
                    <text
                      x={x + barW / 2}
                      y={HEIGHT - PAD_B + 14}
                      fontSize={9}
                      textAnchor="middle"
                      fill="var(--text-3)"
                      fontFamily="var(--mono, monospace)"
                      pointerEvents="none"
                    >
                      {daily.dayLabels[dayIdx]?.split(" ").slice(1).join(" ")}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hovered && hoverLabel && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 12,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow)",
                  minWidth: 200,
                  pointerEvents: "none",
                }}
              >
                <Flex flexDirection="column" gap={4}>
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>
                    {hoverLabel}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                    Total {fmtUSDCompact(hovered.total)}
                  </Text>
                  {hovered.segments
                    .filter((s) => s.value > 0)
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 4)
                    .map((s) => (
                      <Flex
                        key={s.model}
                        alignItems="center"
                        gap={6}
                        style={{ fontSize: 11 }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: colorFor(s.model),
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: "var(--mono, monospace)",
                            fontSize: 11,
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.model}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmtUSDCompact(s.value)}
                        </Text>
                      </Flex>
                    ))}
                </Flex>
              </div>
            )}
          </div>
        )}
      </Flex>
    </Surface>
  );
};

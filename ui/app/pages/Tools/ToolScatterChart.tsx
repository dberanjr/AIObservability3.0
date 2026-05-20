import React, { useMemo, useRef, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs } from "../../data/format";
import { CATEGORY_COLOR, TOOL_CATEGORIES } from "./categories";
import {
  ZONE_CALL_THRESHOLD,
  ZONE_COLOR,
  ZONE_LATENCY_THRESHOLD_MS,
  type Tool,
  type ToolZone,
} from "./useTools";

const VIEW_W = 720;
const VIEW_H = 480;
const PAD_L = 56;
const PAD_R = 28;
const PAD_T = 16;
const PAD_B = 32;

interface Plotted {
  tool: Tool;
  cx: number;
  cy: number;
  r: number;
}

interface Scales {
  xToPx: (calls: number) => number;
  yToPx: (avgMs: number) => number;
  innerW: number;
  innerH: number;
  callsMax: number;
  msMax: number;
}

const buildScales = (tools: Tool[]): Scales => {
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;
  const callsMax = Math.max(
    ZONE_CALL_THRESHOLD * 2,
    ...tools.map((t) => t.calls),
  );
  const msMax = Math.max(
    ZONE_LATENCY_THRESHOLD_MS * 2,
    ...tools.map((t) => t.avgMs),
  );
  const logCallsMax = Math.log10(callsMax + 1);
  const logMsMax = Math.log10(msMax + 1);
  return {
    innerW,
    innerH,
    callsMax,
    msMax,
    xToPx: (calls) => PAD_L + (Math.log10(calls + 1) / logCallsMax) * innerW,
    yToPx: (ms) =>
      PAD_T + innerH - (Math.log10(ms + 1) / logMsMax) * innerH,
  };
};

const radiusFor = (avgMs: number): number => {
  // log-scaled bubble radius (DESIGN handoff: size = avg latency).
  const r = Math.log10(avgMs + 10) * 4;
  return Math.max(4, Math.min(18, r));
};

const niceTick = (v: number): string => {
  if (v >= 1_000_000) return `${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
};

const distSq = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => (ax - bx) ** 2 + (ay - by) ** 2;

const CategoryLegend = () => (
  <Flex gap={8} style={{ flexWrap: "wrap" }}>
    {TOOL_CATEGORIES.map((cat) => (
      <Flex key={cat} alignItems="center" gap={4}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: CATEGORY_COLOR[cat],
          }}
        />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{cat}</Text>
      </Flex>
    ))}
  </Flex>
);

export interface ToolScatterChartProps {
  tools: Tool[];
  isLoading: boolean;
  highlightZone: ToolZone | null;
}

export const ToolScatterChart = ({
  tools,
  isLoading,
  highlightZone,
}: ToolScatterChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotted = useMemo<{ scales: Scales; points: Plotted[] }>(() => {
    const scales = buildScales(tools);
    const points: Plotted[] = tools.map((tool) => ({
      tool,
      cx: scales.xToPx(tool.calls),
      cy: scales.yToPx(tool.avgMs),
      r: radiusFor(tool.avgMs),
    }));
    return { scales, points };
  }, [tools]);

  const { scales, points } = plotted;

  /**
   * Single onMouseMove handler — finds the nearest bubble via squared
   * distance. Per DESIGN_HANDOFF gotcha 1, per-circle onMouseEnter/Leave
   * flickers when bubbles overlap.
   */
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const d = distSq(x, y, p.cx, p.cy);
      const threshold = (p.r + 12) ** 2;
      if (d < threshold && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    setHoverIndex(bestIdx === -1 ? null : bestIdx);
  };

  const xThresholdX = scales.xToPx(ZONE_CALL_THRESHOLD);
  const yThresholdY = scales.yToPx(ZONE_LATENCY_THRESHOLD_MS);

  const xTicks = [10, 100, 1000, 10_000, 100_000, 1_000_000].filter(
    (v) => v <= scales.callsMax,
  );
  const yTicks = [10, 100, 1000, 10_000, 60_000].filter(
    (v) => v <= scales.msMax,
  );

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Tool latency vs call volume
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Log-log axes · bubble size = avg latency · color = category{" "}
              {highlightZone && `· filtered to ${highlightZone}`}
            </Text>
          </Flex>
          <CategoryLegend />
        </Flex>

        {isLoading && points.length === 0 ? (
          <Skeleton style={{ height: VIEW_H, borderRadius: 8 }} />
        ) : points.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No tools in the current scope.
          </Text>
        ) : (
          <div style={{ position: "relative" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              onMouseMove={onMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
              role="img"
              aria-label="Tool scatter chart"
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                // Lock the rendered aspect ratio so circles stay round when
                // the container is wider than the viewBox.
                aspectRatio: `${VIEW_W} / ${VIEW_H}`,
              }}
            >
              {/* Quadrant tints */}
              <rect
                x={PAD_L}
                y={PAD_T}
                width={xThresholdX - PAD_L}
                height={yThresholdY - PAD_T}
                fill={ZONE_COLOR.bottleneck}
                fillOpacity={0.05}
                pointerEvents="none"
              />
              <rect
                x={xThresholdX}
                y={PAD_T}
                width={VIEW_W - PAD_R - xThresholdX}
                height={yThresholdY - PAD_T}
                fill={ZONE_COLOR["hot-spot"]}
                fillOpacity={0.06}
                pointerEvents="none"
              />
              <rect
                x={PAD_L}
                y={yThresholdY}
                width={xThresholdX - PAD_L}
                height={VIEW_H - PAD_B - yThresholdY}
                fill={ZONE_COLOR.quiet}
                fillOpacity={0.04}
                pointerEvents="none"
              />
              <rect
                x={xThresholdX}
                y={yThresholdY}
                width={VIEW_W - PAD_R - xThresholdX}
                height={VIEW_H - PAD_B - yThresholdY}
                fill={ZONE_COLOR.healthy}
                fillOpacity={0.05}
                pointerEvents="none"
              />

              {/* Threshold lines */}
              <line
                x1={xThresholdX}
                x2={xThresholdX}
                y1={PAD_T}
                y2={VIEW_H - PAD_B}
                stroke="var(--border)"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              <line
                x1={PAD_L}
                x2={VIEW_W - PAD_R}
                y1={yThresholdY}
                y2={yThresholdY}
                stroke="var(--border)"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />

              {/* Axis labels */}
              {xTicks.map((t) => {
                const x = scales.xToPx(t);
                return (
                  <g key={`x${t}`}>
                    <line
                      x1={x}
                      x2={x}
                      y1={VIEW_H - PAD_B}
                      y2={VIEW_H - PAD_B + 3}
                      stroke="var(--text-3)"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    <text
                      x={x}
                      y={VIEW_H - PAD_B + 14}
                      fontSize={9}
                      textAnchor="middle"
                      fill="var(--text-3)"
                      fontFamily="var(--mono, monospace)"
                      pointerEvents="none"
                    >
                      {niceTick(t)}
                    </text>
                  </g>
                );
              })}
              {yTicks.map((t) => {
                const y = scales.yToPx(t);
                return (
                  <g key={`y${t}`}>
                    <line
                      x1={PAD_L - 3}
                      x2={PAD_L}
                      y1={y}
                      y2={y}
                      stroke="var(--text-3)"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    <text
                      x={PAD_L - 6}
                      y={y + 3}
                      fontSize={9}
                      textAnchor="end"
                      fill="var(--text-3)"
                      fontFamily="var(--mono, monospace)"
                      pointerEvents="none"
                    >
                      {t >= 1000 ? `${t / 1000}s` : `${t}ms`}
                    </text>
                  </g>
                );
              })}

              <text
                x={VIEW_W - PAD_R}
                y={VIEW_H - PAD_B + 24}
                fontSize={10}
                textAnchor="end"
                fill="var(--text-2)"
                pointerEvents="none"
              >
                Call volume →
              </text>
              <text
                x={PAD_L - 40}
                y={PAD_T + 4}
                fontSize={10}
                textAnchor="start"
                fill="var(--text-2)"
                pointerEvents="none"
              >
                ↑ avg latency
              </text>

              {/* Bubbles. pointer-events:none so the SVG-level handler owns hover. */}
              {points.map((p, i) => {
                const dimmed =
                  highlightZone != null && p.tool.zone !== highlightZone;
                return (
                  <circle
                    key={`${p.tool.tool}-${i}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={p.r}
                    fill={p.tool.color}
                    fillOpacity={dimmed ? 0.18 : 0.55}
                    stroke={p.tool.color}
                    strokeOpacity={dimmed ? 0.35 : 0.95}
                    strokeWidth={hoverIndex === i ? 2 : 1}
                    pointerEvents="none"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            {hovered && (
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
                  <Text
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    {hovered.tool.tool}
                  </Text>
                  <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {hovered.tool.category} · {hovered.tool.service}
                  </Text>
                  <Text style={{ fontSize: 11.5 }}>
                    {fmtCount(hovered.tool.calls)} calls · avg{" "}
                    {fmtMs(hovered.tool.avgMs)} · P99 {fmtMs(hovered.tool.p99Ms)}
                  </Text>
                </Flex>
              </div>
            )}
          </div>
        )}
      </Flex>
    </Surface>
  );
};

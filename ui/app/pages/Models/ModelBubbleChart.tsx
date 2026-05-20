import React, { useMemo, useRef, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtTokens, fmtUSD } from "../../data/format";
import {
  PROVIDER_COLOR,
  PROVIDER_DISPLAY,
  type ProviderId,
} from "../../detection/attributes";
import type { ModelRow } from "./useModels";

/**
 * Top-level component (per DESIGN_HANDOFF §8 gotcha 1). Defining the chart
 * nested inside ModelsPage would cause React to remount it on every parent
 * state change, which produces visible tooltip flicker on overlap.
 */

const VIEW_W = 720;
const VIEW_H = 480;
const PAD_L = 56;
const PAD_R = 28;
const PAD_T = 16;
const PAD_B = 36;

interface Plotted {
  model: ModelRow;
  cx: number;
  cy: number;
  r: number;
}

interface Scales {
  xToPx: (tokens: number) => number;
  yToPx: (avgMs: number) => number;
  tokensMax: number;
  msMax: number;
}

const buildScales = (models: ModelRow[]): Scales => {
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;
  const tokensMax = Math.max(
    1_000,
    ...models.map((m) => m.inputTokens + m.outputTokens),
  );
  const msMax = Math.max(100, ...models.map((m) => m.avgMs));
  const logTokensMax = Math.log10(tokensMax + 1);
  const logMsMax = Math.log10(msMax + 1);
  return {
    tokensMax,
    msMax,
    xToPx: (tokens) =>
      PAD_L + (Math.log10(tokens + 1) / logTokensMax) * innerW,
    yToPx: (ms) =>
      PAD_T + innerH - (Math.log10(ms + 1) / logMsMax) * innerH,
  };
};

const bubbleRadius = (requests: number, maxRequests: number): number => {
  if (maxRequests <= 0) return 4;
  const ratio = Math.log10(requests + 1) / Math.log10(maxRequests + 1);
  return Math.max(4, Math.min(22, 4 + ratio * 18));
};

const distSq = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => (ax - bx) ** 2 + (ay - by) ** 2;

const ProviderLegend = ({ models }: { models: ModelRow[] }) => {
  const seen = new Set<ProviderId>();
  models.forEach((m) => seen.add(m.provider.id));
  return (
    <Flex gap={8} style={{ flexWrap: "wrap" }}>
      {Array.from(seen).map((id) => (
        <Flex key={id} alignItems="center" gap={4}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: PROVIDER_COLOR[id],
            }}
          />
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {PROVIDER_DISPLAY[id]}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
};

export interface ModelBubbleChartProps {
  models: ModelRow[];
  isLoading: boolean;
}

export const ModelBubbleChart = ({
  models,
  isLoading,
}: ModelBubbleChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotted = useMemo<{ scales: Scales; points: Plotted[] }>(() => {
    const scales = buildScales(models);
    const maxRequests = models.reduce((m, r) => Math.max(m, r.requests), 0);
    const points: Plotted[] = models.map((model) => ({
      model,
      cx: scales.xToPx(model.inputTokens + model.outputTokens),
      cy: scales.yToPx(model.avgMs),
      r: bubbleRadius(model.requests, maxRequests),
    }));
    return { scales, points };
  }, [models]);

  const { scales, points } = plotted;

  /**
   * Single onMouseMove handler — finds the nearest bubble inside its radius
   * +12px tolerance. Per the gotcha, per-circle onMouseEnter/Leave flickers
   * when bubbles overlap; circles + labels carry pointer-events: none.
   */
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const d = distSq(x, y, p.cx, p.cy);
      const threshold = (p.r + 12) ** 2;
      if (d < threshold && d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIndex(best === -1 ? null : best);
  };

  const xTicks = [1_000, 10_000, 100_000, 1_000_000, 10_000_000].filter(
    (v) => v <= scales.tokensMax,
  );
  const yTicks = [100, 1_000, 10_000, 60_000].filter((v) => v <= scales.msMax);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Models · tokens vs latency
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Log-log axes · bubble size = requests · color = provider
            </Text>
          </Flex>
          <ProviderLegend models={models} />
        </Flex>

        {isLoading && points.length === 0 ? (
          <Skeleton style={{ height: VIEW_H, borderRadius: 8 }} />
        ) : points.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No models in the current scope.
          </Text>
        ) : (
          <div style={{ position: "relative" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              onMouseMove={onMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
              role="img"
              aria-label="Model bubble chart"
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                // Lock the rendered aspect ratio so circles stay round when
                // the container is wider than the viewBox.
                aspectRatio: `${VIEW_W} / ${VIEW_H}`,
              }}
            >
              {/* Axis ticks */}
              {xTicks.map((t) => {
                const x = scales.xToPx(t);
                return (
                  <g key={`x${t}`} pointerEvents="none">
                    <line
                      x1={x}
                      x2={x}
                      y1={VIEW_H - PAD_B}
                      y2={VIEW_H - PAD_B + 3}
                      stroke="var(--text-3)"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={x}
                      y={VIEW_H - PAD_B + 14}
                      fontSize={9}
                      textAnchor="middle"
                      fill="var(--text-3)"
                      fontFamily="var(--mono, monospace)"
                    >
                      {fmtTokens(t)}
                    </text>
                  </g>
                );
              })}
              {yTicks.map((t) => {
                const y = scales.yToPx(t);
                return (
                  <g key={`y${t}`} pointerEvents="none">
                    <line
                      x1={PAD_L - 3}
                      x2={PAD_L}
                      y1={y}
                      y2={y}
                      stroke="var(--text-3)"
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
                      {fmtMs(t)}
                    </text>
                  </g>
                );
              })}

              <text
                x={VIEW_W - PAD_R}
                y={VIEW_H - PAD_B + 28}
                fontSize={10}
                textAnchor="end"
                fill="var(--text-2)"
                pointerEvents="none"
              >
                Tokens →
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

              {points.map((p, i) => (
                <circle
                  key={`${p.model.modelKey}-${i}`}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill={p.model.providerColor}
                  fillOpacity={0.55}
                  stroke={p.model.providerColor}
                  strokeOpacity={0.95}
                  strokeWidth={hoverIndex === i ? 2 : 1}
                  pointerEvents="none"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
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
                  minWidth: 220,
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
                    {hovered.model.model}
                  </Text>
                  <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {hovered.model.provider.label} ·{" "}
                    {hovered.model.type}
                  </Text>
                  <Text style={{ fontSize: 11.5 }}>
                    {fmtCount(hovered.model.requests)} req ·{" "}
                    {fmtTokens(hovered.model.inputTokens + hovered.model.outputTokens)} tok
                  </Text>
                  <Text style={{ fontSize: 11.5 }}>
                    avg {fmtMs(hovered.model.avgMs)} · P95{" "}
                    {fmtMs(hovered.model.p95Ms)} · {fmtUSD(hovered.model.cost)}
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

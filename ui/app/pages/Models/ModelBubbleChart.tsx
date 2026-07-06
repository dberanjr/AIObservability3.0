import React, { useMemo, useRef, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtTokens, fmtUSD } from "../../data/format";
import {
  PROVIDER_COLOR,
  PROVIDER_DISPLAY,
  type ProviderId,
} from "../../detection/attributes";
import { median } from "./finopsLogic";
import type { ModelRow } from "./useModels";
import { ModelDetailModal } from "./ModelDetailModal";
import { EmptyState } from "../../components/EmptyState";
import { SR_ONLY } from "../../components/charts/AreaChart";

/**
 * Per-provider stroke dash pattern — a non-color identity channel so providers
 * stay distinguishable in grayscale / colorblind mode and overlapping
 * semi-transparent bubbles remain separable by their edge (UX report
 * Models/FinOps-13). Mirrored in the legend so the mapping is learnable.
 */
const PROVIDER_DASH: Record<ProviderId, string> = {
  anthropic: "0", // solid
  openai: "5 3", // dashed
  google: "1.5 3", // dotted
  "aws-bedrock": "7 3", // long dash
  azure: "4 3 1.5 3", // dash-dot
  cohere: "2.5 2.5", // even dash
  mistral: "9 3 2 3", // long dash-dot
  unknown: "0",
};

/**
 * Top-level component (per DESIGN_HANDOFF §8 gotcha 1). Defining the chart
 * nested inside ModelsPage would cause React to remount it on every parent
 * state change, which produces visible tooltip flicker on overlap.
 *
 * This is the page's primary cost-efficiency lens: x = $/call (log), y = avg
 * latency (log), bubble size = total spend. The old encoding (x = tokens, size
 * = requests) put volume on two channels and left cost — the page's headline
 * metric — in the tooltip only. Median quadrant guides make the top-right
 * "expensive AND slow" quadrant read at a glance.
 */

const VIEW_W = 720;
const VIEW_H = 480;
const PAD_L = 56;
const PAD_R = 28;
const PAD_T = 16;
const PAD_B = 36;

const costPerCall = (m: ModelRow): number =>
  m.requests > 0 ? m.cost / m.requests : 0;

interface Plotted {
  model: ModelRow;
  cx: number;
  cy: number;
  r: number;
  costPerCall: number;
}

interface Scales {
  xToPx: (costPerCall: number) => number;
  yToPx: (avgMs: number) => number;
  xLo: number;
  xHi: number;
  msMax: number;
  medianCostPx: number | null;
  medianMsPx: number | null;
}

const buildScales = (models: ModelRow[]): Scales => {
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;
  const costs = models.map(costPerCall).filter((c) => c > 0);
  const xLo = Math.max(1e-5, costs.length ? Math.min(...costs) : 0.001);
  const xHi = Math.max(xLo * 10, costs.length ? Math.max(...costs) : 1);
  const logXLo = Math.log10(xLo);
  const logXHi = Math.log10(xHi);
  const xSpan = logXHi - logXLo || 1;
  const msMax = Math.max(100, ...models.map((m) => m.avgMs));
  const logMsMax = Math.log10(msMax + 1);
  const xToPx = (c: number): number => {
    const cc = Math.max(xLo, c);
    return PAD_L + ((Math.log10(cc) - logXLo) / xSpan) * innerW;
  };
  const yToPx = (ms: number): number =>
    PAD_T + innerH - (Math.log10(ms + 1) / logMsMax) * innerH;
  const medianCost = median(costs);
  const medianMs = median(models.map((m) => m.avgMs).filter((v) => v > 0));
  return {
    xToPx,
    yToPx,
    xLo,
    xHi,
    msMax,
    medianCostPx: medianCost > 0 ? xToPx(medianCost) : null,
    medianMsPx: medianMs > 0 ? yToPx(medianMs) : null,
  };
};

const bubbleRadius = (spend: number, maxSpend: number): number => {
  if (maxSpend <= 0) return 4;
  const ratio = Math.log10(spend + 1) / Math.log10(maxSpend + 1);
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
          {/* Colour + dash pattern together — the dash carries provider
              identity when hue is unavailable (grayscale / colorblind). */}
          <svg width={18} height={8} aria-hidden style={{ flex: "0 0 auto" }}>
            <line
              x1={0}
              y1={4}
              x2={18}
              y2={4}
              stroke={PROVIDER_COLOR[id]}
              strokeWidth={2.5}
              strokeDasharray={PROVIDER_DASH[id]}
            />
          </svg>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {PROVIDER_DISPLAY[id]}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
};

/** Short label for direct on-bubble annotation (non-color identity cue). */
const shortLabel = (model: string): string =>
  model.length > 16 ? `${model.slice(0, 15)}…` : model;

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
  const [selected, setSelected] = useState<ModelRow | null>(null);
  // Spoken readout of the keyboard-focused bubble, fed to an aria-live region
  // so the tooltip's content is reachable without a pointer (Models/FinOps-13).
  const [srText, setSrText] = useState("");

  const plotted = useMemo<{ scales: Scales; points: Plotted[] }>(() => {
    const scales = buildScales(models);
    const maxSpend = models.reduce((m, r) => Math.max(m, r.cost), 0);
    const points: Plotted[] = models.map((model) => ({
      model,
      cx: scales.xToPx(costPerCall(model)),
      cy: scales.yToPx(model.avgMs),
      r: bubbleRadius(model.cost, maxSpend),
      costPerCall: costPerCall(model),
    }));
    return { scales, points };
  }, [models]);

  const { scales, points } = plotted;

  /** Indices of the largest-spend bubbles, for direct labelling. */
  const labelledIndices = useMemo(() => {
    return points
      .map((p, i) => ({ i, spend: p.model.cost }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 4)
      .map((e) => e.i);
  }, [points]);

  /**
   * Resolve which bubble the cursor maps to. Containment wins first: among the
   * bubbles whose circle actually contains the point we keep the LAST-drawn one
   * (highest index = rendered on top), so hovering inside a bubble always
   * selects THAT bubble — not a neighbour whose center happens to be closer.
   * Only when the cursor is inside no bubble do we fall back to the nearest
   * center within a small tolerance. Per the overlap gotcha, the single handler
   * lives on the svg; circles/labels carry pointer-events: none.
   */
  const bubbleAt = (e: React.MouseEvent<SVGSVGElement>): number => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return -1;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    let contained = -1;
    let nearest = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const d = distSq(x, y, p.cx, p.cy);
      if (d <= p.r ** 2) contained = i; // keep last (topmost) containing bubble
      const threshold = (p.r + 12) ** 2;
      if (d < threshold && d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    return contained !== -1 ? contained : nearest;
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const best = bubbleAt(e);
    setHoverIndex(best === -1 ? null : best);
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const best = bubbleAt(e);
    if (best !== -1) setSelected(points[best].model);
  };

  // Keyboard traversal order: left-to-right by $/call (x), ties broken by
  // latency (y). Arrow keys walk this order so movement feels spatial; the
  // same hoverIndex drives the visual tooltip + highlight ring for keyboard
  // users, and Enter/Space opens the model's detail modal.
  const navOrder = useMemo(
    () =>
      points
        .map((_, i) => i)
        .sort((a, b) => points[a].cx - points[b].cx || points[a].cy - points[b].cy),
    [points],
  );

  const readoutFor = (i: number): string => {
    const p = points[i];
    return `${p.model.model}, ${p.model.provider.label}, ${fmtUSD(
      p.costPerCall,
    )} per call, avg ${fmtMs(p.model.avgMs)} latency, ${fmtUSD(
      p.model.cost,
    )} spend. Press Enter to open detail.`;
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    if (e.key === "Enter" || e.key === " ") {
      if (hoverIndex != null) {
        e.preventDefault();
        setSelected(points[hoverIndex].model);
      }
      return;
    }
    if (e.key === "Escape") {
      setHoverIndex(null);
      setSrText("");
      return;
    }
    let dir = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dir = 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") dir = -1;
    else if (e.key === "Home") {
      e.preventDefault();
      const t = navOrder[0];
      setHoverIndex(t);
      setSrText(readoutFor(t));
      return;
    } else if (e.key === "End") {
      e.preventDefault();
      const t = navOrder[navOrder.length - 1];
      setHoverIndex(t);
      setSrText(readoutFor(t));
      return;
    } else return;
    e.preventDefault();
    const curPos = hoverIndex == null ? -1 : navOrder.indexOf(hoverIndex);
    let nextPos = curPos === -1 ? (dir === 1 ? 0 : navOrder.length - 1) : curPos + dir;
    nextPos = Math.max(0, Math.min(navOrder.length - 1, nextPos));
    const target = navOrder[nextPos];
    setHoverIndex(target);
    setSrText(readoutFor(target));
  };

  const onBlur = () => {
    setHoverIndex(null);
    setSrText("");
  };

  const xTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(
    (v) => v >= scales.xLo && v <= scales.xHi,
  );
  const yTicks = [100, 1_000, 10_000, 60_000].filter((v) => v <= scales.msMax);
  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  /** Non-visual summary of the plotted models for screen readers. */
  const ariaSummary = useMemo(() => {
    const top = [...models]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map(
        (m) =>
          `${m.model}: ${fmtUSD(costPerCall(m))} per call, avg ${fmtMs(m.avgMs)}, ${fmtUSD(m.cost)} spend`,
      )
      .join("; ");
    return `Model cost-efficiency scatter, ${models.length} models. Top by spend — ${top}`;
  }, [models]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between" gap={12}>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Models · $/call vs latency · log-log axes · bubble size = spend ·
            dashed guides = fleet medians · click for detail
          </Text>
          <ProviderLegend models={models} />
        </Flex>

        {isLoading && points.length === 0 ? (
          <Skeleton style={{ height: VIEW_H, borderRadius: 8 }} />
        ) : points.length === 0 ? (
          <EmptyState
            bare
            cause="no-activity"
            title="No models in the current scope."
            hint="gen_ai.request.model"
          />
        ) : (
          <div style={{ position: "relative" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              onMouseMove={onMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={onClick}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              role="img"
              tabIndex={0}
              aria-label={`${ariaSummary}. Use arrow keys to move between models; Enter opens detail.`}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                cursor: hoverIndex != null ? "pointer" : "default",
                // Lock the rendered aspect ratio so circles stay round when
                // the container is wider than the viewBox.
                aspectRatio: `${VIEW_W} / ${VIEW_H}`,
              }}
            >
              {/* Median quadrant guides */}
              {scales.medianCostPx != null && (
                <g pointerEvents="none">
                  <line
                    x1={scales.medianCostPx}
                    x2={scales.medianCostPx}
                    y1={PAD_T}
                    y2={VIEW_H - PAD_B}
                    stroke="var(--text-4)"
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
              {scales.medianMsPx != null && (
                <g pointerEvents="none">
                  <line
                    x1={PAD_L}
                    x2={VIEW_W - PAD_R}
                    y1={scales.medianMsPx}
                    y2={scales.medianMsPx}
                    stroke="var(--text-4)"
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
              {scales.medianCostPx != null && scales.medianMsPx != null && (
                <text
                  x={VIEW_W - PAD_R - 4}
                  y={PAD_T + 12}
                  fontSize={9}
                  textAnchor="end"
                  fill="var(--text-4)"
                  pointerEvents="none"
                >
                  expensive &amp; slow →
                </text>
              )}

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
                      {fmtUSD(t)}
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
                $/call →
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
                  strokeDasharray={PROVIDER_DASH[p.model.provider.id]}
                  pointerEvents="none"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Highlight ring on the active bubble — a visible focus cue for
                  keyboard users (and emphasis for the mouse). */}
              {hoverIndex != null && (
                <circle
                  cx={points[hoverIndex].cx}
                  cy={points[hoverIndex].cy}
                  r={points[hoverIndex].r + 3}
                  fill="none"
                  stroke="var(--text)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* Direct labels on the largest-spend bubbles — a non-color
                  identity cue so the chart isn't legible by hue alone. */}
              {labelledIndices.map((i) => {
                const p = points[i];
                return (
                  <text
                    key={`label-${p.model.modelKey}`}
                    x={p.cx}
                    y={p.cy - p.r - 3}
                    fontSize={9.5}
                    textAnchor="middle"
                    fill="var(--text-2)"
                    pointerEvents="none"
                  >
                    {shortLabel(p.model.model)}
                  </text>
                );
              })}
            </svg>

            {hovered && (
              <div
                // Visual echo of the SR_ONLY live readout below — hidden from
                // AT so keyboard nav announces once, not twice.
                aria-hidden
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
                    {hovered.model.provider.label} · {hovered.model.type}
                  </Text>
                  <Text style={{ fontSize: 11.5 }}>
                    {fmtUSD(hovered.costPerCall)}/call ·{" "}
                    {fmtUSD(hovered.model.cost)} spend
                  </Text>
                  <Text style={{ fontSize: 11.5 }}>
                    {fmtCount(hovered.model.requests)} req ·{" "}
                    {fmtTokens(
                      hovered.model.inputTokens + hovered.model.outputTokens,
                    )}{" "}
                    tok
                  </Text>
                  <Text style={{ fontSize: 11.5 }}>
                    avg {fmtMs(hovered.model.avgMs)} · P95{" "}
                    {fmtMs(hovered.model.p95Ms)}
                  </Text>
                </Flex>
              </div>
            )}
            {/* Keyboard-cursor readout for the focused bubble. */}
            <div aria-live="polite" style={SR_ONLY}>
              {srText}
            </div>
          </div>
        )}
      </Flex>
      {selected && (
        <ModelDetailModal model={selected} onClose={() => setSelected(null)} />
      )}
    </Surface>
  );
};

/**
 * Measure-then-draw node-map renderer.
 *
 * The 8 tier cards lay out with normal flow (spine rows + a 4-up leaf row); we
 * then measure their boxes (refs + ResizeObserver + fonts.ready) and draw the
 * connecting edges in an absolutely-positioned SVG behind them. Edge thickness
 * tracks live call volume; a dashed magenta arc is the reasoning-loop feedback
 * edge (llm → agent). Hovering a node or edge spotlights its neighbours;
 * a lens spotlights its contributing path. Flowing packets + dash drift are
 * decorative and motion-gated in CSS.
 */
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MapNode } from "./MapNode";
import { FrameworkNode } from "./FrameworkNode";
import { useFrameworkNodes } from "./useFrameworkNodes";
import { TIER_ICONS } from "./icons";
import {
  ARCH_NODES,
  EDGES,
  LEAF_GRID,
  LEAF_KEYS,
  LOOP,
  SPINE_ROWS,
  edgeKey,
  spotlightEdges,
  type ArchNodeMeta,
  type DetailSpec,
  type LensId,
} from "./model";
import type { ArchData } from "./useArchitectureData";
import type { LayerKey } from "../../../data/ai-layer-patterns";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Geo {
  rects: Partial<Record<LayerKey, Rect>>;
  W: number;
  H: number;
}

const NODE_KEYS: LayerKey[] = [...SPINE_ROWS, ...LEAF_KEYS];

const Arrow = ({
  x,
  y,
  dirX,
  dirY,
  className,
  size = 7,
}: {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  className: string;
  size?: number;
}) => {
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const px = -uy;
  const py = ux;
  const bx = x - ux * size * 1.6;
  const by = y - uy * size * 1.6;
  return (
    <polygon
      className={className}
      points={`${x},${y} ${bx + px * size},${by + py * size} ${bx - px * size},${by - py * size}`}
    />
  );
};

interface Props {
  data: ArchData;
  lensId: LensId | null;
  loading: boolean;
  onPick: (meta: ArchNodeMeta) => void;
  onOpenSpec: (spec: DetailSpec) => void;
}

export const NodeMap = ({ data, lensId, loading, onPick, onOpenSpec }: Props) => {
  const { frameworks, isLoading: fwLoading } = useFrameworkNodes();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nodeEls = useRef<Partial<Record<LayerKey, HTMLDivElement | null>>>({});
  const [geo, setGeo] = useState<Geo | null>(null);
  const [hoverNode, setHoverNode] = useState<LayerKey | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ key: string; x: number; y: number; rate: string } | null>(null);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const rects: Partial<Record<LayerKey, Rect>> = {};
    for (const k of NODE_KEYS) {
      const el = nodeEls.current[k];
      if (!el) return;
      const b = el.getBoundingClientRect();
      rects[k] = { x: b.left - wr.left, y: b.top - wr.top, w: b.width, h: b.height };
    }
    setGeo({ rects, W: wr.width, H: wr.height });
  }, []);

  useLayoutEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    let t1 = 0;
    measure();
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    t1 = window.setTimeout(measure, 140);
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(measure).catch(() => {});
    }
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Re-measure when the framework row's contents (and thus its size) change,
    // so the orchestrator edges re-anchor to the updated row geometry.
  }, [measure, lensId, frameworks, fwLoading]);

  const focus = useMemo(() => {
    if (hoverEdge) {
      if (hoverEdge.key === "loop") {
        return { active: true, nodes: new Set<LayerKey>([LOOP.from, LOOP.to]), edges: new Set([hoverEdge.key]) };
      }
      const [f, t] = hoverEdge.key.split("-") as [LayerKey, LayerKey];
      return { active: true, nodes: new Set<LayerKey>([f, t]), edges: new Set([hoverEdge.key]) };
    }
    if (hoverNode) {
      const ns = new Set<LayerKey>([hoverNode]);
      const es = new Set<string>();
      for (const e of EDGES) {
        if (e.from === hoverNode || e.to === hoverNode) {
          ns.add(e.from);
          ns.add(e.to);
          es.add(edgeKey(e.from, e.to));
        }
      }
      if (LOOP.from === hoverNode || LOOP.to === hoverNode) {
        ns.add(LOOP.from);
        ns.add(LOOP.to);
        es.add("loop");
      }
      return { active: true, nodes: ns, edges: es };
    }
    if (lensId) {
      const ns = data.spotlight[lensId] ?? new Set<LayerKey>();
      if (ns.size > 0) {
        return { active: true, nodes: ns, edges: spotlightEdges(ns, lensId === "loop") };
      }
    }
    return { active: false, nodes: new Set<LayerKey>(), edges: new Set<string>() };
  }, [hoverNode, hoverEdge, lensId, data.spotlight]);

  // The 2 highest-volume edges get an always-on rate label so throughput is
  // comparable at rest (not hover-only). Edges that already carry a finding pill
  // or have no real span data are skipped to avoid stacking labels on one spot.
  const labeledEdges = useMemo(() => {
    const ranked = EDGES.map((e) => {
      const key = edgeKey(e.from, e.to);
      return { key, w: data.edgeWeight[key] ?? 0, rate: data.edgeRate[key] ?? "" };
    })
      .filter((x) => x.rate && !x.rate.startsWith("no ") && !data.edgeFinding[x.key])
      .sort((a, b) => b.w - a.w);
    return new Set(ranked.slice(0, 2).map((x) => x.key));
  }, [data.edgeWeight, data.edgeRate, data.edgeFinding]);

  const nodeDim = (k: LayerKey): boolean => focus.active && !focus.nodes.has(k);
  const edgeState = (key: string): "normal" | "lit" | "dim" =>
    !focus.active ? "normal" : focus.edges.has(key) ? "lit" : "dim";

  const packetDots = (dPath: string, w: number, loop = false): React.ReactNode[] => {
    const n = loop ? 2 : Math.max(1, Math.round(w * 3));
    const dur = (loop ? 6 : 2.6) / (0.4 + w);
    return Array.from({ length: n }).map((_, k) => (
      <span
        key={k}
        className={loop ? "am-pkt am-pkt-loop" : "am-pkt"}
        style={{
          offsetPath: `path("${dPath}")`,
          animationDuration: `${dur}s`,
          animationDelay: `${-(dur / n) * k}s`,
        }}
      />
    ));
  };

  // Build SVG <g> edges and the absolutely-positioned overlays (packets, pills).
  const svgEdges: React.ReactNode[] = [];
  const overlays: React.ReactNode[] = [];

  if (geo) {
    const R = geo.rects;
    EDGES.forEach((e, i) => {
      const a = R[e.from];
      const b2 = R[e.to];
      if (!a || !b2) return;
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = b2.x + b2.w / 2;
      const y2 = b2.y;
      const dy = Math.max(24, (y2 - y1) * 0.5);
      const dPath = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
      const w = data.edgeWeight[edgeKey(e.from, e.to)] ?? e.baseW;
      const wpx = 2.5 + w * 17;
      const key = edgeKey(e.from, e.to);
      const st = edgeState(key);
      const ghosted = data.nodes[e.to].state === "ghost";

      svgEdges.push(
        <g key={`e${i}`} className={`am-edge-g ${st}`} style={ghosted && st === "normal" ? { opacity: 0.4 } : undefined}>
          <path className="am-edge" d={dPath} strokeWidth={wpx} />
          <path className="am-edge-flow anim" d={dPath} strokeWidth={Math.max(2, wpx - 2)} />
          <path
            className="am-hit"
            d={dPath}
            onMouseEnter={() =>
              setHoverEdge({ key, x: (x1 + x2) / 2, y: (y1 + y2) / 2, rate: data.edgeRate[key] ?? "" })
            }
            onMouseLeave={() => setHoverEdge(null)}
          />
        </g>,
      );
      overlays.push(
        <div key={`pk${i}`} className="am-pkt-layer" data-state={st} style={ghosted ? { opacity: 0.25 } : undefined}>
          {packetDots(dPath, w)}
        </div>,
      );
      const ef = data.edgeFinding[key];
      if (ef) {
        overlays.push(
          <button
            key={`fp${i}`}
            type="button"
            className="am-edge-pill"
            data-tone={ef.tone}
            data-dim={st === "dim" ? "true" : "false"}
            style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}
            onClick={() => onOpenSpec(ef.spec)}
          >
            {ef.label}
          </button>,
        );
      } else if (labeledEdges.has(key) && (!hoverEdge || hoverEdge.key !== key)) {
        // Always-on volume label on the busiest edges (hidden while that edge is
        // hovered, where the richer tooltip takes over).
        overlays.push(
          <div
            key={`er${i}`}
            className="am-edge-rate-static"
            data-dim={st === "dim" ? "true" : "false"}
            style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}
          >
            {data.edgeRate[key]}
          </div>,
        );
      }
    });

    // ── loop edge (always anchors llm → agent) ──────
    const a = R[LOOP.from];
    const b2 = R[LOOP.to];
    if (a && b2) {
      const sx = a.x + a.w;
      const sy = a.y + a.h * 0.4;
      const ex = b2.x + b2.w;
      const ey = b2.y + b2.h * 0.5;
      const bulge = Math.min(geo.W - 14, Math.max(sx, ex) + 130);
      const dPath = `M ${sx} ${sy} C ${bulge} ${sy}, ${bulge} ${ey + 30}, ${ex} ${ey}`;
      const st = edgeState("loop");
      const midY = (sy + ey) / 2;
      svgEdges.push(
        <g key="loop" className={`am-loop-g ${st}`}>
          <path className="am-loop-base" d={dPath} />
          <path className="am-loop-flow anim" d={dPath} />
          <Arrow x={ex} y={ey} dirX={ex - bulge} dirY={ey - (ey + 30)} className="am-loop-arrow" size={9} />
          <path
            className="am-hit"
            d={dPath}
            onMouseEnter={() => setHoverEdge({ key: "loop", x: bulge - 4, y: midY, rate: data.loopRate ?? "" })}
            onMouseLeave={() => setHoverEdge(null)}
          />
        </g>,
      );
      overlays.push(
        <div key="pkloop" className="am-pkt-layer" data-state={st}>
          {packetDots(dPath, 0.5, true)}
        </div>,
      );
      if (data.loopPct != null) {
        overlays.push(
          <button
            key="loop-pill"
            type="button"
            className="am-loop-pill"
            data-dim={st === "dim" ? "true" : "false"}
            style={{ left: bulge - 4, top: midY }}
            onClick={() => onOpenSpec({ kind: "loop" })}
          >
            LOOP {data.loopPct.toFixed(0)}%
          </button>,
        );
      }
    }
  }

  const renderNode = (k: LayerKey) => (
    <MapNode
      key={k}
      innerRef={(el) => {
        nodeEls.current[k] = el;
      }}
      meta={ARCH_NODES[k]}
      view={data.nodes[k]}
      lensId={lensId}
      loading={loading}
      dim={nodeDim(k)}
      onPick={onPick}
      onOpenSpec={onOpenSpec}
      onHover={(id) => setHoverNode(id as LayerKey | null)}
    />
  );

  return (
    <div className="am-stage" ref={wrapRef} data-focus={focus.active ? "true" : "false"}>
      <svg className="am-edges" width={geo ? geo.W : "100%"} height={geo ? geo.H : "100%"}>
        {svgEdges}
      </svg>
      {overlays}
      {hoverEdge && hoverEdge.rate && (
        <div className="am-edge-rate" style={{ left: hoverEdge.x, top: hoverEdge.y }}>
          {hoverEdge.rate}
        </div>
      )}
      <div className="am-grid">
        {SPINE_ROWS.map((k) =>
          k === "orchestrator" ? (
            <div className="am-row" key={k}>
              {/* The orchestrator tier is split into one node per framework. The
                  whole row registers as nodeEls["orchestrator"] so the orchestrator
                  edges (gateway→orchestrator, orchestrator→agent) still anchor to it
                  as a group. (The reasoning loop now anchors llm→agent, not here.)
                  It always renders a measurable element (a tile during load, a
                  fallback when empty) so edges never break. */}
              <div
                className="am-fw-row"
                ref={(el) => {
                  nodeEls.current.orchestrator = el;
                }}
              >
                {frameworks.length > 0 ? (
                  frameworks.map((fw) => (
                    <FrameworkNode
                      key={fw.id}
                      framework={fw}
                      dim={nodeDim("orchestrator")}
                      onPick={(f) => onOpenSpec({ kind: "framework", id: f.id })}
                    />
                  ))
                ) : fwLoading ? (
                  <div className="am-fw-node am-fw-muted" data-cat="core" aria-hidden>
                    <div className="am-node-shimmer">
                      <span className="am-shimmer-bar am-shimmer-num" />
                      <span className="am-shimmer-bar am-shimmer-sub" />
                    </div>
                  </div>
                ) : (
                  <div className="am-fw-node am-fw-muted" data-cat="core" data-status="muted">
                    <div className="am-fw-head">
                      <span className="am-fw-icon">
                        {TIER_ICONS.orchestrator}
                        <span className="am-fw-dot" />
                      </span>
                      <span className="am-fw-title">Orchestrator</span>
                    </div>
                    <div className="am-fw-sub">no framework spans in scope</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="am-row" key={k}>
              {renderNode(k)}
            </div>
          ),
        )}
        <div className="am-leaves-grid">{LEAF_GRID.map(renderNode)}</div>
      </div>
    </div>
  );
};

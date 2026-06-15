/**
 * A single tier card in the node-map. Renders the active lens's cell (count-up
 * headline + clickable metric badges) for instrumented tiers, a faint
 * placeholder line for otelGap ("none") / undetected ("ghost") / "inferred"
 * tiers, or a shimmer while the summarize is still loading (gradual paint). The
 * whole card is the drill target; badges and the enrich chip open the modal.
 */
import React from "react";
import { TIER_ICONS } from "./icons";
import { CountUp } from "./CountUp";
import { Spark } from "./Spark";
import { statusColor } from "./tokens";
import { resolveCell, type ArchNodeMeta, type DetailSpec, type LensId, type NodeView } from "./model";

interface Props {
  meta: ArchNodeMeta;
  view: NodeView;
  lensId: LensId | null;
  loading: boolean;
  dim: boolean;
  innerRef: (el: HTMLDivElement | null) => void;
  onPick: (meta: ArchNodeMeta) => void;
  onOpenSpec: (spec: DetailSpec) => void;
  onHover: (id: string | null) => void;
}

export const MapNode = ({
  meta,
  view,
  lensId,
  loading,
  dim,
  innerRef,
  onPick,
  onOpenSpec,
  onHover,
}: Props) => {
  const cell = resolveCell(view, lensId);
  const isData = cell.headline !== undefined;
  // Data-bearing tiers (not client/gateway) shimmer until the summarize lands.
  const showShimmer = !isData && loading && meta.category !== "edge";
  // The sparkline tracks the active lens's metric (latency / errors / tokens),
  // falling back to throughput.
  const sparkData =
    lensId === "latency"
      ? view.seriesLatency
      : lensId === "errors"
        ? view.seriesErrors
        : lensId === "cost"
          ? view.seriesCost
          : view.series;

  return (
    <div
      ref={innerRef}
      className="am-node"
      data-cat={meta.category}
      data-status={cell.status}
      data-state={view.state}
      data-dim={dim ? "true" : "false"}
      role="button"
      tabIndex={0}
      aria-label={`${meta.name} — ${view.reason || cell.sub}`}
      onClick={() => onPick(meta)}
      onMouseEnter={() => onHover(meta.key)}
      onMouseLeave={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(meta);
        }
      }}
    >
      {view.findings > 0 && (
        <span className="am-node-find" data-tone={view.findingTone ?? "warning"}>
          {view.findings}
        </span>
      )}

      <div className="am-node-head">
        <span className="am-node-icon">
          {TIER_ICONS[meta.key]}
          <span className="am-node-dot" />
        </span>
        <span className="am-node-title">{meta.name}</span>
        {sparkData && (
          <span className="am-node-spark">
            <Spark data={sparkData} color={statusColor(cell.status)} width={84} height={24} />
          </span>
        )}
        {view.enrich && (
          <button
            type="button"
            className="am-node-enrich"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSpec({ kind: "enrich", layer: meta.key });
            }}
          >
            {view.enrich}
          </button>
        )}
      </div>

      {isData ? (
        <>
          <div className="am-node-metric">
            <span className="am-node-num">
              <CountUp value={cell.headline as string} />
            </span>
            <span className="am-node-unit">{cell.sub}</span>
          </div>
          {cell.badges.length > 0 && (
            <div className="am-node-badges">
              {cell.badges.map((b, i) =>
                b.spec ? (
                  <button
                    key={i}
                    type="button"
                    className="am-badge"
                    data-tone={b.tone}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (b.spec) onOpenSpec(b.spec);
                    }}
                  >
                    {b.text}
                  </button>
                ) : (
                  <span key={i} className="am-badge" data-tone={b.tone} style={{ cursor: "default" }}>
                    {b.text}
                  </span>
                ),
              )}
            </div>
          )}
        </>
      ) : showShimmer ? (
        <div className="am-node-shimmer" aria-hidden>
          <span className="am-shimmer-bar am-shimmer-num" />
          <span className="am-shimmer-bar am-shimmer-sub" />
        </div>
      ) : (
        <div className="am-node-sub">{cell.sub}</div>
      )}
    </div>
  );
};

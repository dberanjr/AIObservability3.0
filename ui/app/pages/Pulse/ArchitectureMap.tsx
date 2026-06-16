/**
 * Pulse hero — the AI Application Architecture node-map.
 *
 * An interactive, volume-weighted map of the 8 tiers an agentic request flows
 * through, wired to real gen_ai.* span data (useArchitectureData). Undetected
 * resource tiers render as ghosts; the Memory tier is "inferred" when only
 * langgraph_checkpoint_ns is present. A use-case lens spotlights the
 * contributing path and summarises the top finding on it; nodes open a tier
 * drawer; finding pills / badges / scope chips open a detail modal. The map
 * supplements the top tab bar (drill-outs route through the shared router).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Surface } from "@dynatrace/strato-components/layouts";
import { useTabNav, type FocusParam } from "../../lib/nav";
import { NodeMap } from "./archMap/NodeMap";
import { NodeDrawer } from "./archMap/NodeDrawer";
import { DetailModal } from "./archMap/DetailModal";
import { useArchitectureData } from "./archMap/useArchitectureData";
import { resolveDetail, type DetailDrill, type ModalDetail } from "./archMap/getDetail";
import { USE_CASE_LENSES, type ArchNodeMeta, type DetailSpec, type LensId } from "./archMap/model";
import { SEVERITY_RANK } from "./anomalies/types";
import { ARCH_MAP_CSS } from "./archMap/mapCss";
import { AM_ROOT_VARS, statusColor } from "./archMap/tokens";
import { useSpendBreakdown } from "./useSpendBreakdown";
import type { ArchData } from "./archMap/useArchitectureData";

interface BannerView {
  status: "critical" | "warning" | "healthy" | "muted";
  headline: string;
  detail: string;
}

/** Summarise the lens from real findings on its contributing tiers. */
const computeBanner = (lensId: string | null, data: ArchData): BannerView | null => {
  const lens = lensId ? USE_CASE_LENSES.find((l) => l.id === lensId) : null;
  if (!lens) return null;
  const onPath = data.findings.filter((f) => f.layer && lens.layers.includes(f.layer));
  const top = [...onPath].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
  if (top) {
    return {
      status: top.severity === "info" ? "warning" : top.severity,
      headline: `${top.category} · ${top.entity}`,
      detail: top.context,
    };
  }
  return { status: "muted", headline: lens.label, detail: lens.hint };
};

/**
 * Distribute a real per-model spend total across buckets in proportion to token
 * volume — gives a $/bucket series whose total matches the accurate (non-flat-
 * blended) spend without needing per-model tokens per bucket.
 */
const spendByTokenShare = (tokens: number[], total: number): number[] | undefined => {
  const sum = tokens.reduce((a, b) => a + b, 0);
  if (sum <= 0 || !Number.isFinite(total)) return undefined;
  return tokens.map((t) => total * (t / sum));
};

const relTime = (ms: number | null, now: number): string => {
  if (ms == null) return "refreshing…";
  const s = Math.floor((now - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

const Chip = ({ n, label, onClick }: { n: number | null; label: string; onClick: () => void }) => (
  <button type="button" className="am-chip" onClick={onClick}>
    <b>{n == null ? "—" : n}</b> {label}
  </button>
);

export const ArchitectureMap = () => {
  const data = useArchitectureData();
  const spend = useSpendBreakdown();
  const goToTab = useTabNav();
  const [lensId, setLensId] = useState<LensId | null>(null);
  const [picked, setPicked] = useState<ArchNodeMeta | null>(null);
  const [detail, setDetail] = useState<ModalDetail | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicked(null);
        setDetail(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openSpec = (spec: DetailSpec) => {
    const resolved = resolveDetail(spec, {
      findings: data.findings,
      counts: data.counts,
      breakdown: data.breakdown,
      loopPct: data.loopPct,
      loopEntity: data.loopEntity,
      series: data.series,
      edgeSignals: data.edgeSignals,
    });
    if (resolved) setDetail(resolved);
  };

  const onDrill = (drill: DetailDrill) =>
    goToTab(drill.path, { focus: drill.focus as FocusParam, params: drill.params });

  const banner = useMemo(() => computeBanner(lensId, data), [lensId, data]);
  const findingCount = data.findings.length;

  return (
    <Surface elevation="raised" padding={0}>
      <style data-aiobs-archmap>{ARCH_MAP_CSS}</style>
      <div className="am-root" style={{ padding: 18, ...AM_ROOT_VARS }}>
        {/* header */}
        <div className="am-head">
          <div>
            <h3 className="am-title">AI Application Architecture</h3>
            <div className="am-sub">
              <strong style={{ color: "var(--text)", marginRight: 2 }}>Fleet-wide</strong>
              <Chip n={data.counts.services} label="services" onClick={() => openSpec({ kind: "scope", which: "services" })} />
              <Chip n={data.counts.agents} label="agents" onClick={() => openSpec({ kind: "scope", which: "agents" })} />
              <Chip n={data.counts.tools} label="tools" onClick={() => openSpec({ kind: "scope", which: "tools" })} />
              <Chip n={findingCount} label="findings" onClick={() => openSpec({ kind: "scope", which: "findings" })} />
            </div>
          </div>
          <div className="am-head-right">
            <span className="am-live">
              <span className="am-live-dot" />
              <b>Live</b> · {relTime(data.refreshedMs, now)}
            </span>
            <span className="am-lens-label">Lens</span>
            <div className="am-lens-group">
              {USE_CASE_LENSES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`am-lens-pill${lensId === l.id ? " active" : ""}`}
                  onClick={() => setLensId((cur) => (cur === l.id ? null : l.id))}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* lens banner */}
        {banner && (
          <div className="am-banner" data-status={banner.status} style={{ marginTop: 14 }}>
            <span className="am-banner-dot" style={{ background: statusColor(banner.status) }} />
            <div className="am-banner-body">
              <div className="am-banner-head">{banner.headline}</div>
              <div className="am-banner-detail">{banner.detail}</div>
            </div>
          </div>
        )}

        {/* map — structure paints immediately; per-tier metrics fill in
            (gradual load) as the summarize returns, so there's no full-page wait. */}
        <div style={{ marginTop: 16 }}>
          {data.empty && !data.isLoading ? (
            <div style={{ fontSize: 12, color: "var(--text-3)", padding: "24px 0", textAlign: "center" }}>
              No AI spans in the current scope / scan budget — widen the timeframe or raise the scan limit.
            </div>
          ) : (
            <NodeMap
              data={data}
              lensId={lensId}
              loading={data.isLoading}
              onPick={setPicked}
              onOpenSpec={openSpec}
            />
          )}
        </div>

        {/* legend */}
        <div className="am-legend" style={{ marginTop: 16 }}>
          <span className="am-leg">
            <span className="am-leg-dots">
              <span className="am-leg-dot" style={{ background: "var(--green-2)" }} />
              <span className="am-leg-dot" style={{ background: "var(--amber)" }} />
              <span className="am-leg-dot" style={{ background: "var(--red)" }} />
            </span>
            health
          </span>
          <span className="am-leg">
            <span className="am-leg-line" /> edge = call volume
          </span>
          <span className="am-leg">
            <span className="am-leg-loop" /> reasoning loop
          </span>
          <span className="am-leg">
            <span className="am-leg-dash" /> no native OTel / inferred
          </span>
          <span className="am-leg">
            <span className="am-leg-find">N</span> findings on tier
          </span>
        </div>
        <div className="am-foot">
          Tiers are wired to live gen_ai.* spans · ghosted tiers emit no native telemetry · select any node, pill, or
          chip for detail.
        </div>
      </div>

      <NodeDrawer
        meta={picked}
        view={picked ? data.nodes[picked.key] : null}
        tierSeries={
          picked
            ? {
                throughput: data.series.throughput[picked.key],
                latencyMs: data.series.latencyMs[picked.key],
                errors: data.series.errors[picked.key],
                // Tokens are billed at the LLM tier. Spend distributes the REAL
                // per-model total (useSpendBreakdown — actual rates, blended only
                // for models genuinely missing from the table) across buckets by
                // token share, so no flat blended rate is applied.
                tokens: picked.key === "llm" ? data.series.tokens : undefined,
                spendUsd: picked.key === "llm" ? spendByTokenShare(data.series.tokens, spend.total) : undefined,
                labels: data.series.labels,
                intervalLabel: data.series.intervalLabel,
              }
            : null
        }
        onClose={() => setPicked(null)}
        onDrill={(path, focus) => goToTab(path, { focus: focus as FocusParam })}
      />
      <DetailModal detail={detail} onClose={() => setDetail(null)} onDrill={onDrill} />
    </Surface>
  );
};

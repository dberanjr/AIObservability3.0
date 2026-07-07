/**
 * Right-hand drawer with the full picture for one tier: its live headline +
 * metric chips, the problem patterns that live at this tier (copy sourced from
 * ai-layer-patterns.ts — never re-authored here), the OTel attributes that make
 * it observable, and a drill-out CTA to the owning tab.
 */
import React from "react";
import {
  drillRoute,
  layerByKey,
  patternDisabledReason,
  patternStatus,
} from "../../../data/ai-layer-patterns";
import { fmtCount, fmtMs, fmtPercent, fmtTokens, fmtUSDCompact } from "../../../data/format";
import { ARCH_COLORS, statusColor } from "./tokens";
import { Spark } from "./Spark";
import { FilterTrigger } from "../../../components/FilterTrigger";
import type { ArchNodeMeta, NodeView } from "./model";
import type { ClientUpstream } from "./useClientUpstream";

/** Per-tier time series for the drawer charts. */
export interface TierSeries {
  throughput?: number[];
  latencyMs?: number[];
  errors?: number[];
  /** Tokens per bucket (LLM tier only). */
  tokens?: number[];
  /** Blended spend ($) per bucket (LLM tier only). */
  spendUsd?: number[];
  labels: string[];
  /** "per hour" / "per 5 min" — appended to chart titles. */
  intervalLabel: string;
}

const STATUS_LABEL: Record<string, string> = {
  healthy: "Healthy",
  warning: "Needs attention",
  critical: "Critical",
};

const stateLabel = (view: NodeView): string => {
  if (view.status !== "muted") return STATUS_LABEL[view.status] ?? "";
  if (view.state === "inferred") return "Inferred — no native spans";
  if (view.state === "ghost") return "No telemetry in scope";
  return "No native telemetry";
};

const TIER_TAG: Record<string, string> = {
  live: "detected",
  enrichment: "needs enrichment",
  card: "reference",
};

interface Props {
  meta: ArchNodeMeta | null;
  view: NodeView | null;
  tierSeries: TierSeries | null;
  /** Upstream callers for the Client tier drawer (null for other tiers). */
  clientUpstream?: ClientUpstream | null;
  onClose: () => void;
  onDrill: (path: string, focus?: string) => void;
}

/** Upstream-callers list for the Client tier — each row filters the whole app
 *  to that service on click. */
const ClientUpstreamSection = ({ data }: { data: ClientUpstream }) => {
  if (data.services.length === 0) return null;
  return (
    <div className="am-dsection">
      <div className="am-dsection-h">Upstream services · click to filter the app</div>
      <div className="am-contrib">
        {data.services.map((s) => (
          <div key={s.id} className="am-pattern">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <FilterTrigger
                attribute="service.name"
                value={[s.name]}
                label="upstream service"
              >
                <span className="am-contrib-name">{s.name}</span>
              </FilterTrigger>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtCount(s.requests)} req · {fmtPercent(s.errPct)} err · p90{" "}
                {fmtMs(s.p90Ms)}
              </span>
            </div>
            {s.series.length >= 2 && (
              <Spark
                data={s.series}
                color="var(--blue)"
                width={360}
                height={34}
                fluid
                format={fmtCount}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/** One metric's small-multiple: label + colour swatch keyed to the line, hover
 *  reveals the per-bucket value (readout preserved from the old full-width
 *  chart). Absent / <2-point / all-zero series are filtered out by the caller. */
interface TrendSpec {
  key: string;
  title: string;
  data: number[];
  color: string;
  format: (n: number) => string;
}

/** Build the visible trend small-multiples: same suppression rules as before —
 *  drop a series that is missing, has <2 points, or is entirely zero (e.g. a
 *  tier with no errors) so the drawer never stacks a flat low-signal line. */
const buildTrends = (series: TierSeries): TrendSpec[] => {
  const specs: Array<Omit<TrendSpec, "data"> & { data?: number[] }> = [
    // ARCH_COLORS.core is a literal accent (not the .am-root-scoped --am-core
    // var) so it resolves in the drawer, which is a DOM sibling of .am-root.
    { key: "throughput", title: "Throughput", data: series.throughput, color: ARCH_COLORS.core, format: fmtCount },
    { key: "latency", title: "Latency p90", data: series.latencyMs, color: "var(--blue)", format: fmtMs },
    { key: "errors", title: "Errors", data: series.errors, color: "var(--red)", format: fmtCount },
    { key: "tokens", title: "Tokens", data: series.tokens, color: "var(--purple)", format: fmtTokens },
    { key: "spend", title: "Spend", data: series.spendUsd, color: "var(--green-2)", format: fmtUSDCompact },
  ];
  return specs.filter(
    (s): s is TrendSpec => !!s.data && s.data.length >= 2 && s.data.some((v) => v > 0),
  );
};

export const NodeDrawer = ({ meta, view, tierSeries, clientUpstream, onClose, onDrill }: Props) => {
  const open = !!meta && !!view;
  const layer = meta ? layerByKey(meta.key) : null;
  const color = view ? statusColor(view.status) : "var(--blue)";

  return (
    <>
      <div className={`am-scrim${open ? " open" : ""}`} onClick={onClose} />
      <aside className={`am-drawer${open ? " open" : ""}`} aria-hidden={!open}>
        {meta && view && layer && (
          <>
            <div className="am-drawer-head">
              <div>
                <div className="am-drawer-title">{meta.name}</div>
                <div className="am-drawer-status" style={{ color }}>
                  ● {stateLabel(view)}
                </div>
              </div>
              <button type="button" className="am-drawer-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>

            <div className="am-drawer-body">
              {view.headline !== undefined ? (
                <div className="am-metric-grid">
                  <div className="am-metric">
                    <div className="am-metric-k">{view.sub}</div>
                    <div className="am-metric-v" style={{ color }}>
                      {view.headline}
                    </div>
                  </div>
                  {view.badges.slice(0, 3).map((b, i) => (
                    <div className="am-metric" key={i}>
                      <div className="am-metric-k">{b.tone === "cost" ? "spend" : "signal"}</div>
                      <div className="am-metric-v">{b.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="am-empty-note">{view.reason || view.sub}</div>
              )}

              {meta.key === "client" && clientUpstream && (
                <ClientUpstreamSection data={clientUpstream} />
              )}

              {tierSeries &&
                (() => {
                  // Collapse the old five full-width stacked charts into one
                  // small-multiples block: a 2-up grid with a shared interval in
                  // the header and a shared time axis (first→last bucket) below,
                  // so the trends read as one coherent unit. Each cell keeps its
                  // own hover readout (per-bucket value + time).
                  const trends = buildTrends(tierSeries);
                  if (trends.length === 0) return null;
                  const labels = tierSeries.labels;
                  return (
                    <div className="am-dsection">
                      <div className="am-dsection-h">
                        Trends{tierSeries.intervalLabel ? ` · ${tierSeries.intervalLabel}` : ""}
                      </div>
                      <div className="am-trend-grid">
                        {trends.map((s) => (
                          <div className="am-trend-cell" key={s.key}>
                            <span className="am-trend-title">
                              <span className="am-trend-swatch" style={{ background: s.color }} />
                              {s.title}
                            </span>
                            <Spark
                              data={s.data}
                              color={s.color}
                              height={46}
                              fluid
                              format={s.format}
                              labels={labels}
                            />
                          </div>
                        ))}
                      </div>
                      {labels.length >= 2 && (
                        <div className="am-trend-axis">
                          <span>{labels[0]}</span>
                          <span>{labels[labels.length - 1]}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

              <div className="am-dsection">
                <div className="am-dsection-h">Token behaviour</div>
                <p className="am-modal-why">{layer.tokens}</p>
              </div>

              <div className="am-dsection">
                <div className="am-dsection-h">Problem patterns at this tier</div>
                <div className="am-contrib">
                  {layer.patterns.map((p) => {
                    const status = patternStatus(p.tier);
                    const detected = status === "detected" && p.drills.length > 0;
                    const disabledReason = detected ? undefined : patternDisabledReason(status);
                    return (
                      <div
                        key={p.title}
                        className={`am-pattern${detected ? "" : " is-disabled"}`}
                        title={disabledReason}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="am-contrib-name">{p.title}</span>
                          <span className="am-pattern-tag">{TIER_TAG[p.tier]}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4 }}>{p.detail}</div>
                        {detected && (
                          <div className="am-pattern-drills">
                            {p.drills.map((d) => (
                              <button
                                key={`${d.tab}:${d.focus}:${d.label}`}
                                type="button"
                                className="am-drill"
                                aria-label={`${p.title} — ${d.label}`}
                                onClick={() => {
                                  onClose();
                                  onDrill(drillRoute(d), d.focus);
                                }}
                              >
                                ↗ {d.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="am-dsection">
                <div className="am-dsection-h">OTel attributes</div>
                <p className="am-modal-why">
                  <span className="am-code">{layer.otel}</span>
                </p>
              </div>

              {meta.drill && (
                <button
                  type="button"
                  className="am-cta"
                  onClick={() => {
                    onClose();
                    onDrill(meta.drill!.path, meta.drill!.focus);
                  }}
                >
                  ↗ Open in {meta.drill.path === "/prompts" ? "Prompts" : "Agents"}
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
};

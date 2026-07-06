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
import { statusColor } from "./tokens";
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

const DrawerChart = ({
  title,
  data,
  color,
  labels,
  format,
}: {
  title: string;
  data?: number[];
  color: string;
  labels: string[];
  format: (n: number) => string;
}) => {
  if (!data || data.length < 2) return null;
  // Skip an all-zero series (e.g. a tier with no errors) so the drawer doesn't
  // stack a flat, low-signal line for every metric a tier happens not to emit.
  if (!data.some((v) => v > 0)) return null;
  return (
    <div className="am-dsection">
      <div className="am-dsection-h">{title}</div>
      <div style={{ width: "100%" }}>
        <Spark data={data} color={color} width={360} height={52} fluid format={format} labels={labels} />
      </div>
    </div>
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

              {tierSeries && (
                <>
                  <DrawerChart
                    title={`Throughput${tierSeries.intervalLabel ? ` · ${tierSeries.intervalLabel}` : ""}`}
                    data={tierSeries.throughput}
                    color={color}
                    labels={tierSeries.labels}
                    format={fmtCount}
                  />
                  <DrawerChart
                    title={`Latency (p90)${tierSeries.intervalLabel ? ` · ${tierSeries.intervalLabel}` : ""}`}
                    data={tierSeries.latencyMs}
                    color="var(--blue)"
                    labels={tierSeries.labels}
                    format={fmtMs}
                  />
                  <DrawerChart
                    title={`Errors${tierSeries.intervalLabel ? ` · ${tierSeries.intervalLabel}` : ""}`}
                    data={tierSeries.errors}
                    color="var(--red)"
                    labels={tierSeries.labels}
                    format={fmtCount}
                  />
                  <DrawerChart
                    title={`Tokens${tierSeries.intervalLabel ? ` · ${tierSeries.intervalLabel}` : ""}`}
                    data={tierSeries.tokens}
                    color="var(--purple)"
                    labels={tierSeries.labels}
                    format={fmtTokens}
                  />
                  <DrawerChart
                    title={`Spend ($)${tierSeries.intervalLabel ? ` · ${tierSeries.intervalLabel}` : ""}`}
                    data={tierSeries.spendUsd}
                    color="var(--green-2)"
                    labels={tierSeries.labels}
                    format={fmtUSDCompact}
                  />
                </>
              )}

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

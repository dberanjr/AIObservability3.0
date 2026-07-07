/**
 * `UpstreamFlowMap` — the centerpiece 3-column service-flow visualization for
 * the Pulse "upstream services" detail modal: callers → AI services →
 * components (models/agents/tools), with a click-to-spotlight interaction
 * that shows what a single caller can reach.
 *
 * This is a FRESH, standalone layout — it does not embed into or modify the
 * existing fleet architecture map (NodeMap/mapCss). It borrows only the
 * *styling conventions* from that map (chip look from `.am-badge`, the
 * status-glyph-as-dot pattern from `UpstreamGoldenSignalsTable`'s RowStatus)
 * via inline styles, so nothing here depends on the `.am-root`-scoped
 * stylesheet.
 *
 * Spotlight is the core interaction, not connector lines: v1 ships WITHOUT
 * drawn SVG connectors (ref/ResizeObserver-based line routing was judged not
 * worth the fragility for a first cut) — co-highlighting via opacity is the
 * whole mechanism, and it is sufficient to answer "what can this caller
 * reach?" Selecting a caller dims every non-selected caller, every AI service
 * the caller can't reach, and every component-group card for those
 * unreachable services. Deselecting (or no selection) returns to a full,
 * undimmed global view.
 */
import React, { useMemo } from "react";
import { fmtCount } from "../../../data/format";
import { errorRateStatus } from "../../Explorer/serviceStatus";
import { statusColor, STATUS_CUE } from "../../../theme/statusColor";
import type { AiServiceNode, UpstreamCaller, UpstreamGraph } from "./upstreamGraph";

const MAX_CHIPS = 4;

const GRID_TEMPLATE = "minmax(180px,1fr) minmax(160px,1fr) minmax(240px,1.6fr)";

export interface UpstreamFlowMapProps {
  graph: UpstreamGraph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** Column label — small, uppercase, muted; identical treatment across all
 *  three columns so the eye reads them as one header row. */
const ColumnHeader = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: "var(--text-3)",
    }}
  >
    {children}
  </div>
);

const EmptyNote = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: 11.5, color: "var(--text-3)", fontStyle: "italic" }}>{children}</span>
);

/** Error-rate severity cue for a caller node. Mirrors
 *  `UpstreamGoldenSignalsTable`'s RowStatus exactly: the STATUS_CUE glyph
 *  IS the dot — its shape (●/▲/⬤) differs by severity, so the cue never
 *  relies on colour alone, and an aria-label carries the same information
 *  to assistive tech. */
const CallerStatusDot = ({ errPct }: { errPct: number }) => {
  const status = errorRateStatus(errPct);
  const cue = STATUS_CUE[status];
  const label = `${cue.label} error rate`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        flex: "0 0 auto",
        color: statusColor(status),
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      {cue.glyph}
    </span>
  );
};

/** A single descriptive chip (model/agent/tool name) — non-interactive,
 *  styled after the arch map's `.am-badge` convention (see mapCss.ts): small,
 *  bordered, muted text. */
const Chip = ({ label }: { label: string }) => (
  <span
    style={{
      fontSize: 10.5,
      fontWeight: 600,
      color: "var(--text-2)",
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 4,
      padding: "1px 7px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 160,
    }}
  >
    {label}
  </span>
);

/** A capped chip row for one component category (Models/Agents/Tools) — the
 *  first MAX_CHIPS render as chips, the rest collapse into "+N". Renders
 *  nothing when the category is empty so blank categories don't leave gaps. */
const ChipGroup = ({ label, items }: { label: string; items: string[] }) => {
  if (items.length === 0) return null;
  const visible = items.slice(0, MAX_CHIPS);
  const overflow = items.length - visible.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-3)",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {visible.map((v) => (
          <Chip key={v} label={v} />
        ))}
        {overflow > 0 && (
          <span style={{ fontSize: 10.5, color: "var(--text-3)", alignSelf: "center" }}>
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
};

const countLabel = (n: number, singular: string): string =>
  `${fmtCount(n)} ${singular}${n === 1 ? "" : "s"}`;

/** Column 1 node: a caller service. Click toggles spotlight selection. */
const CallerNode = ({
  caller,
  selected,
  dim,
  onSelect,
}: {
  caller: UpstreamCaller;
  selected: boolean;
  dim: boolean;
  onSelect: (id: string | null) => void;
}) => (
  <button
    type="button"
    data-caller-id={caller.id}
    aria-pressed={selected}
    onClick={() => onSelect(selected ? null : caller.id)}
    style={{
      all: "unset",
      boxSizing: "border-box",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "9px 12px",
      borderRadius: 8,
      border: selected ? "1px solid var(--blue)" : "1px solid var(--border)",
      background: selected
        ? "color-mix(in oklab, var(--blue) 10%, var(--surface))"
        : "var(--surface)",
      boxShadow: "var(--shadow)",
      opacity: dim ? 0.25 : 1,
      transition: "opacity .2s ease, border-color .15s ease, background .15s ease",
    }}
  >
    <CallerStatusDot errPct={caller.errPct} />
    <span
      title={caller.name}
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {caller.name}
    </span>
    <span
      style={{
        flex: "0 0 auto",
        fontSize: 11.5,
        color: "var(--text-2)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {fmtCount(caller.requests)}
    </span>
  </button>
);

/** Column 2 node: an AI service reached by one or more callers. */
const ServiceNode = ({ service, dim }: { service: AiServiceNode; dim: boolean }) => (
  <div
    data-service-id={service.id}
    style={{
      boxSizing: "border-box",
      padding: "9px 12px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--surface)",
      boxShadow: "var(--shadow)",
      opacity: dim ? 0.25 : 1,
      transition: "opacity .2s ease",
    }}
  >
    <div
      title={service.name}
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {service.name}
    </div>
    <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--text-3)" }}>
      {countLabel(service.models.length, "model")} · {countLabel(service.agents.length, "agent")} ·{" "}
      {countLabel(service.tools.length, "tool")}
    </div>
  </div>
);

/** Column 3 card: the model/agent/tool components behind one AI service. */
const ComponentCard = ({ service, dim }: { service: AiServiceNode; dim: boolean }) => {
  const total = service.models.length + service.agents.length + service.tools.length;
  return (
    <div
      data-service-id={service.id}
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow)",
        opacity: dim ? 0.25 : 1,
        transition: "opacity .2s ease",
      }}
    >
      <div
        title={service.name}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {service.name}
      </div>
      {total === 0 ? (
        <EmptyNote>No components detected.</EmptyNote>
      ) : (
        <>
          <ChipGroup label="Models" items={service.models} />
          <ChipGroup label="Agents" items={service.agents} />
          <ChipGroup label="Tools" items={service.tools} />
        </>
      )}
    </div>
  );
};

/**
 * The 3-column upstream service-flow map: callers → AI services → components.
 *
 * Spotlight: when `selectedId` is set, every caller other than the selected
 * one, every AI service the selected caller can't reach, and every component
 * card for those unreachable services drop to 25% opacity. Clearing the
 * selection (`selectedId === null`) restores full opacity everywhere — the
 * "global view".
 */
export const UpstreamFlowMap = ({ graph, selectedId, onSelect }: UpstreamFlowMapProps) => {
  const selected = useMemo(
    () => (selectedId ? (graph.callers.find((c) => c.id === selectedId) ?? null) : null),
    [graph.callers, selectedId],
  );
  const spotlighting = selectedId != null;
  const reachableServiceIds = useMemo(
    () => new Set(selected ? selected.aiServiceIds : []),
    [selected],
  );

  const serviceDim = (service: AiServiceNode): boolean =>
    spotlighting && !reachableServiceIds.has(service.id);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE, gap: 24 }}>
        {/* Column 1 — callers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ColumnHeader>Callers · {fmtCount(graph.callers.length)}</ColumnHeader>
          {graph.callers.length === 0 ? (
            <EmptyNote>No upstream callers in scope.</EmptyNote>
          ) : (
            graph.callers.map((caller) => (
              <CallerNode
                key={caller.id}
                caller={caller}
                selected={caller.id === selectedId}
                dim={spotlighting && caller.id !== selectedId}
                onSelect={onSelect}
              />
            ))
          )}
        </div>

        {/* Column 2 — AI services */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ColumnHeader>AI services · {fmtCount(graph.services.length)}</ColumnHeader>
          {graph.services.length === 0 ? (
            <EmptyNote>No AI services detected.</EmptyNote>
          ) : (
            graph.services.map((service) => (
              <ServiceNode key={service.id} service={service} dim={serviceDim(service)} />
            ))
          )}
        </div>

        {/* Column 3 — components (models/agents/tools) per AI service */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ColumnHeader>Components</ColumnHeader>
          {graph.services.length === 0 ? (
            <EmptyNote>No components detected.</EmptyNote>
          ) : (
            graph.services.map((service) => (
              <ComponentCard key={service.id} service={service} dim={serviceDim(service)} />
            ))
          )}
        </div>
      </div>

      <p
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "var(--text-3)",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        Topology view — what each caller can reach (Smartscape + gen_ai), not per-request
        attribution.
      </p>
    </div>
  );
};

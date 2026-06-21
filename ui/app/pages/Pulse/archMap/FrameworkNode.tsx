/**
 * A compact orchestration-framework tile in the node-map's orchestrator row.
 *
 * The single "Orchestrator" tier is split into one of these per detected
 * framework (LangGraph, LangChain, … + "Other"). It mirrors the `.am-node`
 * visual language — a status dot, count headline, "workflow spans" sub, and two
 * small badges (error rate + p90) — but in a tighter `.am-fw-node` footprint so
 * 3–5 fit side-by-side in the `.am-fw-row`. Clicking opens the framework detail.
 */
import React from "react";
import { TIER_ICONS } from "./icons";
import { CountUp } from "./CountUp";
import { fmtCount, fmtMs, fmtPercent } from "../../../data/format";
import { frameworkStatus, fwRateStatus, type FrameworkNode as FrameworkNodeData } from "./frameworkNodes";

interface Props {
  framework: FrameworkNodeData;
  dim?: boolean;
  onPick: (framework: FrameworkNodeData) => void;
}

export const FrameworkNode = ({ framework, dim, onPick }: Props) => {
  const status = frameworkStatus(framework);
  const errStatus = fwRateStatus(framework.errorRate);
  const errPct = framework.errorRate * 100;
  return (
    <div
      className="am-fw-node"
      data-cat="core"
      data-status={status}
      data-dim={dim ? "true" : "false"}
      role="button"
      tabIndex={0}
      aria-label={`${framework.label} — ${fmtCount(framework.count)} workflow spans`}
      onClick={() => onPick(framework)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(framework);
        }
      }}
    >
      <div className="am-fw-head">
        <span className="am-fw-icon">
          {TIER_ICONS.orchestrator}
          <span className="am-fw-dot" />
        </span>
        <span className="am-fw-title">{framework.label}</span>
      </div>
      <div className="am-fw-metric">
        <span className="am-fw-num">
          <CountUp value={fmtCount(framework.count)} />
        </span>
        <span className="am-fw-unit">workflow spans</span>
      </div>
      <div className="am-fw-badges">
        <span
          className="am-badge"
          data-tone={errStatus === "critical" ? "critical" : errStatus === "warning" ? "warning" : "neutral"}
          style={{ cursor: "default" }}
        >
          {fmtPercent(errPct)} err
        </span>
        <span className="am-badge" data-tone="neutral" style={{ cursor: "default" }}>
          p90 {fmtMs(framework.p90Ms)}
        </span>
      </div>
    </div>
  );
};

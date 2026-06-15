/**
 * Per-agent tool-call table (Agents-tab "Tools" sub-view, absorbed from the
 * retired Tools tab). Reuses the Tools per-tool query with an added agent
 * filter. Tool definition follows the Tweaks "Agent tools · definition"
 * setting, defaulting to Discovered (count MCP / internal function spans by
 * name) since gen_ai.tool.name is absent on the validation tenants.
 */
import React, { useMemo } from "react";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useSampling } from "../../scope/SamplingContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { useScopedDql } from "../../scope/useScopedDql";
import { useTweaks } from "../../tweaks/TweaksContext";
import { buildToolsQuery, buildDiscoveredToolsQuery } from "../Tools/queries";
import { fmtCount, fmtMs, fmtPercent, toNum } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { HIGH_FREQUENCY_TOOL_THRESHOLD, isHighFrequency } from "./constants";

interface ToolRec {
  tool?: string;
  calls?: number;
  avg_ms?: number;
  p90_ms?: number;
  error_rate_pct?: number;
  retry_rate_pct?: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};
const td: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12.5,
  fontVariantNumeric: "tabular-nums",
};

export const AgentToolsSubview = ({ agentName }: { agentName: string }) => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);
  const { pageConfig } = useTweaks();
  const strict = pageConfig.toolsMode === "strict";

  const query = canQuery
    ? strict
      ? buildToolsQuery(resolution.serviceIds, scope.timeframe, filters, agentName)
      : buildDiscoveredToolsQuery(
          resolution.serviceIds,
          scope.timeframe,
          filters,
          agentName,
        )
    : "";

  const { data, isLoading } = useScopedDql<ToolRec>(query, {
    enabled: canQuery,
    staleTime: 60_000,
  });

  const rows = useMemo(
    () =>
      (data?.records ?? []).map((r) => ({
        tool: r.tool ?? "—",
        calls: num(r.calls) * samplingRatio,
        avgMs: num(r.avg_ms),
        p90Ms: num(r.p90_ms),
        errorPct: num(r.error_rate_pct),
        retryPct: num(r.retry_rate_pct),
      })),
    [data, samplingRatio],
  );

  if (isLoading) return null;
  if (rows.length === 0)
    return (
      <EmptyState
        bare
        title="No tool calls for this agent"
        description={
          strict
            ? "Strict mode counts only spans with gen_ai.tool.name (absent on these tenants). Switch tool definition to Discovered in Tweaks."
            : "No MCP / internal function spans found for this agent in the current scope."
        }
      />
    );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={th}>Tool</th>
          <th style={{ ...th, textAlign: "right" }}>Calls</th>
          <th style={{ ...th, textAlign: "right" }}>Avg</th>
          <th style={{ ...th, textAlign: "right" }}>P90</th>
          <th style={{ ...th, textAlign: "right" }}>Error %</th>
          <th style={{ ...th, textAlign: "right" }}>Retry %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const highFreq = isHighFrequency(r.calls);
          return (
            <tr
              key={r.tool}
              style={{ borderTop: "1px solid var(--surface-3)" }}
            >
              <td style={{ ...td, textAlign: "left" }}>
                {r.tool}
                {highFreq && (
                  <span
                    title={`Called ${fmtCount(r.calls)}× — above the high-frequency threshold (${HIGH_FREQUENCY_TOOL_THRESHOLD})`}
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--amber)",
                      border: "1px solid var(--amber)",
                      borderRadius: 4,
                      padding: "0 4px",
                    }}
                  >
                    high frequency
                  </span>
                )}
              </td>
              <td style={{ ...td, textAlign: "right" }}>{fmtCount(r.calls)}</td>
              <td style={{ ...td, textAlign: "right" }}>{fmtMs(r.avgMs)}</td>
              <td style={{ ...td, textAlign: "right" }}>{fmtMs(r.p90Ms)}</td>
              <td style={{ ...td, textAlign: "right" }}>
                {fmtPercent(r.errorPct)}
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                {fmtPercent(r.retryPct)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

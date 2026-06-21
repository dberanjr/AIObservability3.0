/**
 * Per-agent call topology (Agents-tab "Topology" sub-view, absorbed from the
 * retired Topology tab). Shows a single-agent, trace-level topology by reusing
 * the EXISTING Prompts `TraceTopology` renderer seeded with the agent's
 * most-recent trace (resolved via `buildAgentLatestTraceQuery`). This gives the
 * true parent→child call graph for one representative execution, rather than a
 * fleet-style aggregate. The rendered `TraceTopology` sizes itself; `height`
 * only sizes the loading skeleton shown while the trace and its spans resolve.
 */
import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildAgentLatestTraceQuery } from "./queries";
import { useTraceSpans } from "../Prompts/useTraceSpans";
import { TraceTopology } from "../Prompts/TraceTopology";

interface LatestTraceRecord {
  trace_id?: string;
  start_ms?: number | string;
}

export const AgentTopologySubview = ({
  agentName,
  height = 460,
}: {
  agentName: string;
  height?: number;
}) => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const traceQ = useScopedDql<LatestTraceRecord>(
    canQuery
      ? buildAgentLatestTraceQuery(
          resolution.serviceIds,
          scope.timeframe,
          agentName,
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const rec = traceQ.data?.records?.[0];
  const traceId = rec?.trace_id ?? null;
  const startMsNum =
    rec?.start_ms == null ? NaN : Number(rec.start_ms);
  const startMs = Number.isFinite(startMsNum) ? startMsNum : undefined;

  const spans = useTraceSpans(traceId, startMs);

  if (traceQ.isLoading || (traceId !== null && spans.isLoading))
    return <Skeleton style={{ height, borderRadius: 10 }} />;

  if (traceId === null || spans.spans.length === 0)
    return (
      <EmptyState
        bare
        title="No call topology for this agent"
        description="No recent trace carries this agent's name in the current scope, so there's nothing to graph."
      />
    );

  return (
    <div style={{ width: "100%" }}>
      <TraceTopology spans={spans.spans} isLoading={spans.isLoading} />
    </div>
  );
};

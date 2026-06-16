import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { DataGapNote } from "../../components/DataGapNote";
import {
  DegradedTrendPanel,
  IntelligenceDetectorDrawer,
  SLAConfigDrawer,
  SLAOverrideBanner,
  SLAProvider,
  useSLA,
} from "../../components/SLAConfig";
import { AgentsHero } from "./AgentsHero";
import { AgentsTable } from "./AgentsTable";
import { AgentsTilesRow } from "./AgentsTilesRow";
import {
  AgentsActionsRow,
  type AgentOperation,
  type AgentView,
} from "./AgentsViewRow";
import { EvaluationBanner } from "./EvaluationBanner";
import { LatencyTierPanel } from "./LatencyTierPanel";
import { OrchestrationSection } from "./OrchestrationSection";
import { UpstreamServicesTable } from "./UpstreamServicesTable";
import { useAgentEval } from "./useAgentEval";
import { useAgents } from "./useAgents";
import { useDegradedAgents } from "./useDegradedAgents";
import { useOrchestrationNodes } from "./useOrchestrationNodes";
import { useUpstreamServices } from "./useUpstreamServices";

const SLOW_VIEW_P90_MS = 2000;

const AgentsPageBody = () => {
  const { hasActive } = useSLA();
  const agentsResult = useAgents();
  const evalSnap = useAgentEval();
  const upstream = useUpstreamServices();
  const degraded = useDegradedAgents(agentsResult.all);
  const orchestrationNodes = useOrchestrationNodes();

  const [view, setView] = useState<AgentView>("all");
  const [operation, setOperation] = useState<AgentOperation>("all");
  const [previewEval, setPreviewEval] = useState(false);
  const [slaOpen, setSlaOpen] = useState(false);
  const [detectorOpen, setDetectorOpen] = useState(false);

  const filteredSubstantive = useMemo(() => {
    let rows = agentsResult.substantive;
    if (operation !== "all") {
      rows = rows.filter((r) => r.operations.includes(operation));
    }
    if (view === "slow") {
      rows = rows.filter((r) => r.p90Ms > SLOW_VIEW_P90_MS);
    } else if (view === "expensive") {
      rows = [...rows].sort((a, b) => b.cost - a.cost).slice(0, 50);
    } else if (view === "used") {
      rows = [...rows].sort((a, b) => b.invocations - a.invocations).slice(0, 50);
    }
    return rows;
  }, [agentsResult.substantive, view, operation]);


  // Suggested thresholds: fleet P90 × 1.5 / P99 × 1.5 / 5% errors / $0.05 / invocation.
  const suggested = useMemo(() => {
    const subs = agentsResult.substantive;
    if (subs.length === 0) return undefined;
    const sortedP90 = [...subs].map((s) => s.p90Ms).sort((a, b) => a - b);
    const sortedP99 = [...subs].map((s) => s.p99Ms).sort((a, b) => a - b);
    const median = (arr: number[]) =>
      arr.length === 0
        ? 0
        : arr[Math.floor(arr.length / 2)] ?? 0;
    return {
      p90Ms: Math.round(median(sortedP90) * 1.5),
      p99Ms: Math.round(median(sortedP99) * 1.5),
      maxErrorRatePct: 5,
      maxCostPerInvocation: 0.05,
    };
  }, [agentsResult.substantive]);

  const firstError =
    agentsResult.error ??
    evalSnap.error ??
    upstream.error ??
    degraded.error ??
    orchestrationNodes.error ??
    null;

  return (
    <>
      <Flex
        flexDirection="column"
        gap={16}
        style={{ padding: "18px 20px 80px" }}
      >
        {firstError && <ErrorBanner error={firstError} />}
        {hasActive && <SLAOverrideBanner onEdit={() => setSlaOpen(true)} />}

        <AgentsActionsRow
          onSetupDetector={() => setDetectorOpen(true)}
          onConfigureSLA={() => setSlaOpen(true)}
        />

        <AgentsTilesRow
          agents={agentsResult.all}
          isLoading={agentsResult.isLoading}
        />

        <DataGapNote
          tone="warn"
          message="TTFT is blank and per-agent cost is often unattributed (—) in this scope: no time-to-first-token attribute is emitted, and LLM calls run on a separate proxy trace so tokens can't be joined to the agent. Error rate now also includes logical failures (refusals / content-filter)."
          attributes={["gen_ai.usage.time_to_first_token", "gen_ai.usage.cost", "gen_ai.agent.name (on LLM spans)"]}
          bestPractice="Propagate W3C trace context across the LLM proxy so agent and LLM spans share a trace (enables cost attribution), and emit a TTFT attribute on streamed responses. See INSTRUMENTATION-REQUIREMENTS.md P0.1 and P1.5."
          href="https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/"
          hrefLabel="OTel GenAI spans"
        />

        <DegradedTrendPanel
          items={degraded.items}
          isLoading={degraded.isLoading}
          subtitle="Top 5 slow agents (P90 > 2s) versus their rolling 7d baseline"
          emptyMessage="No agents above the slow threshold in the current scope."
        />

        <AgentsHero
          agents={agentsResult.all}
          isLoading={agentsResult.isLoading}
        />

        {/* Agents table — full width, directly above the execution-tier
            breakdown so the per-agent detail and the where-time-goes view
            read together. */}
        <AgentsTable
          rows={filteredSubstantive}
          isLoading={agentsResult.isLoading}
          view={view}
          operation={operation}
          onViewChange={setView}
          onOperationChange={setOperation}
        />

        <LatencyTierPanel />

        <OrchestrationSection rows={orchestrationNodes.nodes} />

        {/* Lower-priority context, parked at the bottom. Upstream services
            collapses to a single row when there are no monitored callers. */}
        <UpstreamServicesTable result={upstream} />

        <EvaluationBanner
          snapshot={evalSnap}
          previewMode={previewEval}
          onPreviewToggle={setPreviewEval}
        />
      </Flex>

      <SLAConfigDrawer
        show={slaOpen}
        onDismiss={() => setSlaOpen(false)}
        suggested={suggested}
      />
      <IntelligenceDetectorDrawer
        show={detectorOpen}
        onDismiss={() => setDetectorOpen(false)}
      />
    </>
  );
};

export const AgentsPage = () => (
  <SLAProvider>
    <AgentsPageBody />
  </SLAProvider>
);

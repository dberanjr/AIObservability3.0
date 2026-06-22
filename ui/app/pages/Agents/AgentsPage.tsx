import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { XmarkIcon } from "@dynatrace/strato-icons";
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
import { useAgentLoops } from "./useAgentLoops";
import { useDegradedAgents } from "./useDegradedAgents";
import { useHighFrequencyAgents } from "./useHighFrequencyAgents";
import { useOrchestrationNodes } from "./useOrchestrationNodes";
import { useUpstreamServices } from "./useUpstreamServices";
import { agentsFocusPreset, applyAgentsFocus, type FocusContext } from "./focus";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";

const SLOW_VIEW_P90_MS = 2000;

const AgentsPageBody = () => {
  const { hasActive } = useSLA();
  const agentsResult = useAgents();
  const evalSnap = useAgentEval();
  const upstream = useUpstreamServices();
  const degraded = useDegradedAgents(agentsResult.all);
  const orchestrationNodes = useOrchestrationNodes();
  const highFreqAgents = useHighFrequencyAgents();
  const agentLoops = useAgentLoops();

  // Pulse problem-pattern drill-down (PP-5): the RAW `?focus` id (not the typed
  // useFocusParam union, which only covers architecture-layer keys). A known id
  // filters/sorts the per-agent rows to that pattern; unknown/absent is a no-op.
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  const focus = new URLSearchParams(search).get("focus");
  const focusPreset = agentsFocusPreset(focus);
  // Remove the `?focus` param (drops the row filter + the chip), keeping every
  // other search param (timeframe, global filter, …) intact.
  const clearFocus = useCallback(() => {
    const next = new URLSearchParams(search);
    next.delete("focus");
    const qs = next.toString();
    navigate({ pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [search, pathname, navigate]);

  // The shared toolbar's global Reset must also clear the `?focus` drill-down,
  // mirroring the Prompts/Explorer reset-handler registration. Keep the latest
  // clearFocus in a ref so the once-registered handler always clears the
  // CURRENT focus (no stale closure over an old search string).
  const { registerResetHandler } = useGlobalFilters();
  const clearFocusRef = useRef(clearFocus);
  clearFocusRef.current = clearFocus;
  useEffect(
    () => registerResetHandler(() => clearFocusRef.current()),
    [registerResetHandler],
  );

  // Auxiliary fleet signals the focus presets reason about (N+1 set + per-agent
  // loop/state context), assembled once.
  const focusCtx = useMemo<FocusContext>(
    () => ({
      highFreqAgents,
      loopByAgent: new Map(
        agentLoops.rows
          .filter((r) => !r.unattributed)
          .map((r) => [
            r.agent,
            {
              loopRatePct: r.loopRatePct,
              runs: r.runs,
              avgNodesPerRun: r.avgNodesPerRun,
            },
          ]),
      ),
    }),
    [highFreqAgents, agentLoops.rows],
  );

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
    // Pulse drill-down: narrow/rank to the focused problem pattern. ANDs with
    // the View / Operation selectors above. No-op when no known `?focus` is set.
    // (The table re-sorts by its own column header, but the row SET — the
    // filter — is what the focus contributes.)
    rows = applyAgentsFocus(focus, rows, focusCtx);
    return rows;
  }, [agentsResult.substantive, view, operation, focus, focusCtx]);


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
        {focusPreset && (
          <Flex alignItems="center" gap={8}>
            <span
              title={
                focusPreset.approximate
                  ? "Approximate: this pattern's exact signal isn't emitted at the agent grain on this tenant — the closest defensible per-agent filter is applied."
                  : undefined
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 6,
                background:
                  "var(--blue-surface, color-mix(in oklab, var(--blue) 12%, transparent))",
                border:
                  "1px solid color-mix(in oklab, var(--blue) 35%, transparent)",
                fontSize: 11.5,
                color: "var(--text)",
                whiteSpace: "nowrap",
                maxWidth: 380,
              }}
            >
              <span style={{ color: "var(--text-2)" }}>Filtered:</span>
              <span style={{ fontWeight: 600 }}>{focusPreset.label}</span>
              {focusPreset.approximate && (
                <span style={{ color: "var(--text-3)", fontSize: 10.5 }}>≈</span>
              )}
              <button
                type="button"
                aria-label={`Remove ${focusPreset.label} filter`}
                title="Clear filter"
                onClick={clearFocus}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  color: "var(--text-3)",
                }}
              >
                <XmarkIcon size={12} />
              </button>
            </span>
          </Flex>
        )}
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
          attributes={["gen_ai.response.ttft", "gen_ai.usage.cost", "gen_ai.agent.name (on LLM spans)"]}
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

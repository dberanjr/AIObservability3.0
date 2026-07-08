# Design: Tool Detection, Orchestration Frameworks, Topology & Trace Completeness

**Date:** 2026-06-18
**Branch:** redesign-5-tab
**Validated against:** ualpre (united nonprod) via Grail DQL

## Problem Statement

Five related defects in how the app classifies and visualizes agentic AI spans,
surfaced during a review with Asad Ali (United) and confirmed against live ualpre data:

1. **Internal library/protocol calls are misclassified as tools.** MCP lifecycle
   spans (`initialize`, `tools/list`) and runtime-internal spans show up as tool
   calls because the classifier infers tool-ness from `span.kind == "client"` and
   the span name containing `_tool`, rather than from authoritative attributes.

2. **Orchestration is shown as a generic tier, not the actual framework.** The app
   lumps all non-LLM/non-tool/non-retrieval spans into a generic "orchestration"
   bucket. It does not identify *which* framework (LangChain, LangGraph, CrewAI,
   LlamaIndex, Pydantic AI, Google ADK) the application is built on.

3. **The Pulse "AI Application Architecture" Orchestrator tier is conceptually
   wrong.** Per Asad: the orchestration framework is the agent's *runtime* (like
   Spring Boot to a Java app) — the agent is built *on top of* it. The framework
   does not "call" the agent as a separate upstream hop. The runtime-internal spans
   currently counted in this tier belong to the Agent tier.

4. **The embedded Agents-tab topology shows duplicate bubbles.** The same entity
   appears twice — once as the blue "AI service" node and once as the purple "agent"
   node — because OTel assigns the same `service.name` to both. This is confusing
   and obscures the real agent → tool / agent → LLM call structure.

5. **Trace view is truncated at 100 spans.** Real traces reach 1M+ spans on ualpre
   (e.g. a single tool called 277× in one trace). The hard `limit 100` returns a
   tiny, misleading slice of a "gigantic" trace.

## Research: Framework Detection Signals

Confirmed by reading the OpenLLMetry instrumentation source and Google ADK telemetry
source, cross-checked against ualpre data.

| Framework | Authoritative signal | Notes |
|---|---|---|
| **LangGraph** | `traceloop.workflow.name == "LangGraph"` | Dominant on ualpre (14,160 spans/2h) |
| **LangChain** | `traceloop.workflow.name` ∈ {`RunnableSequence`, `AgentExecutor`} or `gen_ai.system == "langchain"` | Present on ualpre |
| **CrewAI** | `gen_ai.system == "crewai"` (+ span `crewai.workflow`) | Value-mapped only |
| **LlamaIndex** | `traceloop.workflow.name == "llama_index_query_pipeline"` or `traceloop.entity.name` LlamaIndex agent | — |
| **Haystack** | `traceloop.entity.name == "haystack_pipeline"` (+ span `haystack_pipeline.workflow`) | — |
| **OpenAI Agents SDK** | `traceloop.workflow.name == "Agent Workflow"` or `gen_ai.handoff.*` present | — |
| **Google ADK** | span name `invoke_agent {name}` / `execute_tool {name}` + `gen_ai.workflow.name` | No `gen_ai.system` set |
| **Agno** | `gen_ai.system == "agno"` | Value-mapped only |
| **Pydantic AI** | instrumentation scope / span markers `pydantic_ai` | Best-effort |

### Critical finding: `gen_ai.system` is overloaded

On ualpre, `gen_ai.system == "openai"` denotes the **LLM provider**, not a framework.
But CrewAI and Agno set `gen_ai.system` to `"crewai"` / `"agno"` as the **framework**.
Therefore framework detection MUST be a **value-mapped lookup against a known
framework-name set** — never a raw read of `gen_ai.system`. Values outside the
framework set are treated as LLM providers and ignored for framework resolution.

### Critical finding: MCP tool-call vs lifecycle

On ualpre, real MCP tool invocations are `mcp.method.name == "tools/call"`
(span name `"tools/call GetEmailsFromFolder"`). Lifecycle calls — `tools/list`,
`initialize`, `notifications/*`, `ping` — are NOT tool calls and must be excluded.

## Design

### 1. Tool detection — authoritative cascade

Replace the `span_tier` tool branch in `ui/app/pages/Agents/queries.ts` (and the
matching latency-decomposition query) and the Tools-page classifier with a priority
cascade that prefers explicit attributes over name inference:

```
is_tool =
     traceloop.span.kind == "tool"                              // authoritative (primary on ualpre)
  or isNotNull(gen_ai.tool.name)                                // OTel GenAI tool span
  or mcp.method.name == "tools/call"                            // real MCP tool invocation
```

Explicitly **exclude** from tool classification:
- `mcp.method.name` ∈ {`tools/list`, `initialize`, `notifications/initialized`, `ping`}
- `span.kind == "client"` as a *standalone* signal (dropped entirely — it was the
  root cause of library/protocol calls being counted as tools)
- Span-name `_tool` substring inference (dropped; only used as a last-resort fallback
  gated behind a Tweaks toggle, off by default, for tenants with no tool attributes)

Tool **name** resolution (when classified as a tool): `coalesce(gen_ai.tool.name,
<entity name after ".tools." in traceloop.entity.path>, span.name)`. This implements
Asad's "anything after dot-tools, take that" heuristic as a fallback only.

### 2. Framework identification — value-mapped derived field

Add a derived `framework` field to the Agents aggregate query and a shared
`detectFramework()` resolver in `ui/app/detection/attributes.ts`. Extend the
`Framework` union to include `LangGraph` (already), `LangChain`, `CrewAI`,
`LlamaIndex`, `Haystack`, `OpenAIAgents`, `GoogleADK`, `Agno`, `PydanticAI`,
`Custom`, `Unknown`.

Resolution order (first match wins):
1. `traceloop.workflow.name` / `traceloop.entity.name` pattern table (covers
   LangGraph, LangChain, LlamaIndex, Haystack, OpenAI Agents)
2. `gen_ai.system` **only if value ∈ {crewai, agno, langchain}** → framework
3. span-name pattern `invoke_agent ` + `gen_ai.workflow.name` → Google ADK
4. instrumentation-scope / span marker `pydantic_ai` → Pydantic AI
5. else → `Custom` (some agent attribute present) or `Unknown` (nothing)

Display: a framework badge next to the agent name in the Agents table.

### 3. Pulse "AI Application Architecture" — Orchestrator tier becomes frameworks

In the Pulse architecture node-map:

- **Replace** the single generic Orchestrator box with **N framework boxes**, one
  per framework actually detected in the current scope, splayed across the
  Orchestrator tier (per the approved mockup). Overflow beyond ~5 collapses to a
  "+N more" box.
- Each framework box is a **clickable filter chip**. Clicking it applies a
  **page-wide, trace-scoped global filter** (decision: whole-page scope), reusing
  the existing global-filter / inference-span mechanism — the same "look upward in
  the span tree for the attribute" pattern that agent-row clicks use today. See
  `[[global-filter-trace-scoping]]`.
- Each box shows a health dot derived from that framework's error rate / latency.
- **Move** the runtime/`orch` span counts into the **Agent tier** (decision: fold
  into Agent tier). The Orchestrator tier no longer shows a span-throughput number;
  it shows "frameworks detected." Runtime-internal spans (generate-token, scratchpad,
  tool-registry, MCP lifecycle) are agent-runtime internals per Asad's model.
- Edges: the framework boxes sit above the Agent tier visually but represent
  "what the agents are built on," not a separate calling hop. Edge weight from a
  framework box to the Agent tier = volume of agents on that framework.

### 4. Agents-tab topology — reuse trace topology, single agent node

Replace `ui/app/pages/Agents/AgentTopologySubview.tsx`'s aggregate renderer with the
trace-level `TraceTopology` component from the Prompts tab. When an agent row is
selected:
1. Resolve the most recent (or representative) trace id for that agent.
2. Fetch its spans via the AI-filtered trace query (see §5).
3. Render `TraceTopology` with the same interactive controls (size-by metric,
   category filter, pan/zoom, PNG export).

**Collapse the duplicate bubble:** when a node carrying `gen_ai.agent.name` shares
its `service.name` with the AI-service node, merge them into one agent node. The
merged node shows agent → tool and agent → LLM edges. This is handled in the
topology layout/dedup step, keyed on (service.name, agent.name) identity.

### 5. Trace completeness — AI-filtered fetch, raised ceiling

Modify `buildTraceSpansQuery` in `ui/app/pages/Prompts/queries.ts`:

- **Filter to AI-relevant spans first:** keep spans where any of
  `gen_ai.*`, `traceloop.*`, or `mcp.*` attributes are set (or the span is an
  ancestor on the path to such a span, so the tree stays connected). A 1M-span trace
  with 60 AI spans returns all 60 cleanly instead of an arbitrary first-100 slice.
- **Raise the limit** from 100 to 500 (a Tweaks knob, default 500), applied after the
  AI filter.
- **Truncation flag:** when returned rows ≥ limit, set `isTruncated` and render a
  callout in the trace view: *"Showing 500 of N AI spans — non-AI infrastructure
  spans filtered out."*

This also feeds §4 (the Agents topology now fetches a complete agent sub-trace).

## Components Touched

| Area | Files |
|---|---|
| Tool detection | `ui/app/pages/Agents/queries.ts`, `ui/app/pages/Tools/queries.ts`, `ui/app/detection/classifier.ts` |
| Framework detection | `ui/app/detection/attributes.ts`, `ui/app/pages/Agents/queries.ts`, `ui/app/pages/Agents/AgentsTable.tsx` |
| Pulse architecture map | `ui/app/data/ai-layer-patterns.ts`, Pulse archMap components (`ui/app/pages/Pulse/archMap/`), global-filter resolver in `ui/app/scope/` |
| Agents topology | `ui/app/pages/Agents/AgentTopologySubview.tsx`, `ui/app/pages/Prompts/TraceTopology.tsx` (shared) |
| Trace completeness | `ui/app/pages/Prompts/queries.ts`, trace-view component, `ui/app/tweaks/` |

## Testing

- **Unit:** `detectFramework()` value-mapping table (each framework's signal →
  expected label; `gen_ai.system="openai"` → NOT a framework); tool cascade
  (tools/call → tool, tools/list → not tool, client-kind library span → not tool).
- **Unit:** topology dedup merges same-name service+agent into one node.
- **Unit:** trace query builder emits AI filter + 500 limit + truncation detection.
- **DQL validation:** every new/changed query validated against ualpre via dtctl/MCP
  before merge (per repo memory `[[env-auth-gotchas]]`), honoring scan-limit and
  sampling selectors (per `[[redesign-decisions]]`).

## Out of Scope

- Changing the upstream instrumentation (United emits the attributes; the app adapts).
- Aggregating trace topologies into a smartscape-style service rollup (Asad floated
  it; deferred — the per-trace topology reuse covers the immediate need).
- Pydantic AI detection beyond best-effort scope-marker matching (no Pydantic data on
  ualpre to validate against yet).

## Open Questions (resolved)

- Orch/runtime spans → **fold into Agent tier** (expandable detail deferred).
- Framework chip scope → **whole-page trace-scoped global filter.**

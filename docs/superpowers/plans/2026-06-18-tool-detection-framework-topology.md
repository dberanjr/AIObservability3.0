# Tool Detection, Framework ID, Topology & Trace Completeness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five span-classification/visualization defects: misclassified tools, generic-vs-specific orchestration frameworks, the Pulse Orchestrator tier, duplicate topology bubbles, and truncated traces.

**Architecture:** Pure-logic helpers (framework detection, span classification) live in `ui/app/detection/` and are unit-tested in isolation. DQL query builders are tested on their emitted query string and validated against ualpre via the `mcp__ualpre__execute-dql` tool. UI integration reuses existing components (`TraceTopology`) and the existing global-filter mechanism.

**Tech Stack:** TypeScript, React, Vitest, Dynatrace Grail DQL, Strato components.

**Reference spec:** `docs/superpowers/specs/2026-06-18-tool-detection-framework-topology-design.md`

**Execution note — phase boundaries:** Phases 1–5 fix incorrect data/classification and are independently shippable. Phases 6–7 are the larger Pulse-map visual rework. Checkpoint between Phase 5 and Phase 6.

**Validation rule (applies to every DQL task):** Before marking a query task done, run the emitted query against ualpre with `mcp__ualpre__execute-dql` over `now()-2h`. It must return without DQL-SYNTAX-ERROR. Per repo memory `env-auth-gotchas`, summarize aggregations need a named field (`n = count()`, not bare `count()`), and `trace.id` needs `toUid()`.

---

## Phase 1 — Framework detection foundation

### Task 1: Value-mapped framework detector

**Files:**
- Modify: `ui/app/detection/attributes.ts` (append after the existing `detectFramework` at line 218–230; leave the old function in place — Explorer still calls the old heuristic)
- Test: `ui/app/detection/attributes.test.ts` (append a new `describe` block)

- [ ] **Step 1: Write the failing test**

Append to `ui/app/detection/attributes.test.ts`:

```typescript
import {
  detectFrameworkFromSignals,
  FRAMEWORK_LABEL,
  type FrameworkId,
} from "./attributes";

describe("detectFrameworkFromSignals", () => {
  it("maps traceloop.workflow.name to the framework", () => {
    expect(detectFrameworkFromSignals({ workflowName: "LangGraph" })).toBe("langgraph");
    expect(detectFrameworkFromSignals({ workflowName: "RunnableSequence" })).toBe("langchain");
    expect(detectFrameworkFromSignals({ workflowName: "AgentExecutor" })).toBe("langchain");
    expect(detectFrameworkFromSignals({ workflowName: "Agent Workflow" })).toBe("openai-agents");
    expect(detectFrameworkFromSignals({ workflowName: "llama_index_query_pipeline" })).toBe("llamaindex");
  });

  it("maps traceloop.entity.name for haystack/llamaindex", () => {
    expect(detectFrameworkFromSignals({ entityName: "haystack_pipeline" })).toBe("haystack");
  });

  it("treats gen_ai.system as a framework ONLY for known framework values", () => {
    expect(detectFrameworkFromSignals({ genAiSystem: "crewai" })).toBe("crewai");
    expect(detectFrameworkFromSignals({ genAiSystem: "agno" })).toBe("agno");
    // "openai"/"anthropic" are LLM providers, NOT frameworks — must NOT match.
    expect(detectFrameworkFromSignals({ genAiSystem: "openai" })).toBe("unknown");
    expect(detectFrameworkFromSignals({ genAiSystem: "anthropic" })).toBe("unknown");
  });

  it("detects Google ADK from invoke_agent span + gen_ai.workflow.name", () => {
    expect(
      detectFrameworkFromSignals({ spanName: "invoke_agent triage", genAiWorkflowName: "root" }),
    ).toBe("google-adk");
  });

  it("detects Pydantic AI from instrumentation scope", () => {
    expect(detectFrameworkFromSignals({ scope: "pydantic_ai.models.instrumented" })).toBe("pydantic-ai");
  });

  it("returns custom when an agent signal exists but no framework matches", () => {
    expect(detectFrameworkFromSignals({ spanName: "my_custom_chain" })).toBe("custom");
  });

  it("returns unknown when nothing is present", () => {
    expect(detectFrameworkFromSignals({})).toBe("unknown");
  });

  it("has a human label for every framework id", () => {
    const ids: FrameworkId[] = [
      "langgraph", "langchain", "crewai", "llamaindex", "haystack",
      "openai-agents", "google-adk", "agno", "pydantic-ai", "custom", "unknown",
    ];
    for (const id of ids) expect(FRAMEWORK_LABEL[id]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run app/detection/attributes.test.ts -t detectFrameworkFromSignals`
Expected: FAIL — `detectFrameworkFromSignals is not a function`.

- [ ] **Step 3: Implement the detector**

Append to `ui/app/detection/attributes.ts`:

```typescript
/**
 * Canonical orchestration-framework identity, detected from the OTel/Traceloop
 * signals each instrumentation emits. Unlike `detectFramework` (a span-name
 * heuristic kept for Explorer), this resolves against the AUTHORITATIVE
 * attributes confirmed by reading each instrumentation's source and validated
 * against ualpre. See the design spec's "Research" table.
 */
export type FrameworkId =
  | "langgraph"
  | "langchain"
  | "crewai"
  | "llamaindex"
  | "haystack"
  | "openai-agents"
  | "google-adk"
  | "agno"
  | "pydantic-ai"
  | "custom"
  | "unknown";

export const FRAMEWORK_LABEL: Record<FrameworkId, string> = {
  langgraph: "LangGraph",
  langchain: "LangChain",
  crewai: "CrewAI",
  llamaindex: "LlamaIndex",
  haystack: "Haystack",
  "openai-agents": "OpenAI Agents SDK",
  "google-adk": "Google ADK",
  agno: "Agno",
  "pydantic-ai": "Pydantic AI",
  custom: "Custom",
  unknown: "Unknown",
};

/** Raw span signals used to resolve framework identity. */
export interface FrameworkSignal {
  /** traceloop.workflow.name */
  workflowName?: string | null;
  /** traceloop.entity.name */
  entityName?: string | null;
  /** gen_ai.system — provider for most instrumentations, framework for crewai/agno. */
  genAiSystem?: string | null;
  /** span.name */
  spanName?: string | null;
  /** gen_ai.workflow.name (Google ADK) */
  genAiWorkflowName?: string | null;
  /** OTel instrumentation scope name */
  scope?: string | null;
}

/**
 * gen_ai.system values that denote a FRAMEWORK (not an LLM provider). Only these
 * are honored; any other gen_ai.system value (openai, anthropic, …) is a provider
 * and must NOT resolve to a framework.
 */
const GENAI_SYSTEM_FRAMEWORKS: Record<string, FrameworkId> = {
  crewai: "crewai",
  agno: "agno",
  langchain: "langchain",
};

/** Patterns over traceloop.workflow.name / traceloop.entity.name. */
const TL_NAME_PATTERNS: Array<[RegExp, FrameworkId]> = [
  [/langgraph/i, "langgraph"],
  [/^(runnable|agentexecutor|retrieval[\s_-]?chain)/i, "langchain"],
  [/agent\s*workflow/i, "openai-agents"],
  [/llama[\s_-]?index/i, "llamaindex"],
  [/haystack/i, "haystack"],
  [/crew/i, "crewai"],
];

export const detectFrameworkFromSignals = (sig: FrameworkSignal): FrameworkId => {
  // 1. Traceloop workflow/entity names — the primary signal on real tenants.
  for (const name of [sig.workflowName, sig.entityName]) {
    if (!name) continue;
    for (const [re, id] of TL_NAME_PATTERNS) if (re.test(name)) return id;
  }
  // 2. gen_ai.system — only when the value is a known framework (value-mapped).
  const sys = (sig.genAiSystem ?? "").trim().toLowerCase();
  if (sys && GENAI_SYSTEM_FRAMEWORKS[sys]) return GENAI_SYSTEM_FRAMEWORKS[sys];
  // 3. Google ADK — invoke_agent/execute_tool span names with a gen_ai.workflow.name.
  if (sig.spanName && /^(invoke_agent|execute_tool)\b/.test(sig.spanName) && sig.genAiWorkflowName)
    return "google-adk";
  // 4. Pydantic AI — instrumentation scope marker (best-effort; no ualpre data).
  if (sig.scope && /pydantic[_-]?ai/i.test(sig.scope)) return "pydantic-ai";
  // 5. Some agent signal present but unmatched → custom; nothing at all → unknown.
  if (sig.workflowName || sig.entityName || sig.spanName || sys) return "custom";
  return "unknown";
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ui && npx vitest run app/detection/attributes.test.ts -t detectFrameworkFromSignals`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add ui/app/detection/attributes.ts ui/app/detection/attributes.test.ts
git commit -m "feat(detection): value-mapped orchestration-framework detector"
```

---

## Phase 2 — Authoritative tool detection in DQL

### Task 2: Replace the tool branch in the Agents span-tier classifier

**Files:**
- Modify: `ui/app/pages/Agents/queries.ts:39-41` (the `span_tier` `fieldsAdd`) and `ui/app/pages/Agents/queries.ts:187-190` (latency-decomposition `tier`)
- Test: `ui/app/pages/Agents/constants.test.ts` is unrelated; create `ui/app/pages/Agents/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ui/app/pages/Agents/queries.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildAgentsQuery, buildLatencyDecompositionQuery } from "./queries";
import type { Timeframe } from "../../scope/types";

const TF: Timeframe = { from: "now()-2h" };

describe("buildAgentsQuery — authoritative tool classification", () => {
  const q = buildAgentsQuery(null, TF);

  it("classifies tools by traceloop.span.kind / gen_ai.tool.name / mcp tools-call", () => {
    expect(q).toContain('traceloop.span.kind == "tool"');
    expect(q).toContain("isNotNull(gen_ai.tool.name)");
    expect(q).toContain('mcp.method.name == "tools/call"');
  });

  it("does NOT use span.kind==client or _tool name inference as a tool signal", () => {
    // The old, over-broad signals must be gone from the tool branch.
    expect(q).not.toContain('span.kind == "client" or contains(lname,"_tool")');
  });

  it("excludes MCP lifecycle methods from tools", () => {
    expect(q).toContain('mcp.method.name != "tools/list"');
    expect(q).toContain('mcp.method.name != "initialize"');
  });
});

describe("buildLatencyDecompositionQuery — tool tier", () => {
  it("uses the same authoritative tool signal", () => {
    const q = buildLatencyDecompositionQuery(null, TF);
    expect(q).toContain('traceloop.span.kind == "tool"');
    expect(q).not.toContain('span.kind == "client" or contains(lname,"_tool")');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run app/pages/Agents/queries.test.ts`
Expected: FAIL — assertions about `traceloop.span.kind == "tool"` not found.

- [ ] **Step 3: Edit the Agents query span_tier branch**

In `ui/app/pages/Agents/queries.ts`, replace lines 39–41 (the `span_tier = ...` expression) with:

```
    span_tier = if(isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.system), "llm",
      else: if(gen_ai.operation.name == "embeddings" or contains(lname,"retriev") or contains(lname,"vector") or contains(lname,"embed") or contains(lname,"rds") or contains(lname,"sql") or contains(lname,"catalog") or contains(lname,"lookup") or contains(lname,"query") or contains(lname,"search"), "retrieval",
      else: if((traceloop.span.kind == "tool" or isNotNull(gen_ai.tool.name) or mcp.method.name == "tools/call") and mcp.method.name != "tools/list" and mcp.method.name != "initialize", "tool", else: "orch")))
```

Note: `gen_ai.system` was added to the LLM branch intentionally — on ualpre LLM client spans carry `gen_ai.system` (e.g. `"openai"`). This is consistent with the design's note that `gen_ai.system` is provider-on-LLM-spans.

- [ ] **Step 4: Edit the latency-decomposition tier branch**

In `ui/app/pages/Agents/queries.ts`, replace lines 187–190 (`tier = if(...)`) with:

```
| fieldsAdd tier = if(isNotNull(gen_ai.provider.name), "LLM",
    else: if(gen_ai.operation.name == "embeddings" or contains(lname,"retriev") or contains(lname,"vector") or contains(lname,"embed") or contains(lname,"rds") or contains(lname,"sql") or contains(lname,"catalog") or contains(lname,"lookup") or contains(lname,"query") or contains(lname,"search"), "Retrieval/DB",
    else: if((traceloop.span.kind == "tool" or isNotNull(gen_ai.tool.name) or mcp.method.name == "tools/call") and mcp.method.name != "tools/list" and mcp.method.name != "initialize", "Tool",
    else: "Orchestration")))
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ui && npx vitest run app/pages/Agents/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Validate both queries against ualpre**

Use `mcp__ualpre__execute-dql` with the string returned by `buildAgentsQuery(null, { from: "now()-2h" })` and by `buildLatencyDecompositionQuery(null, { from: "now()-2h" })`. Each must return records with no DQL-SYNTAX-ERROR, and the Agents result `tool_spans` column must be present.

- [ ] **Step 7: Commit**

```bash
git add ui/app/pages/Agents/queries.ts ui/app/pages/Agents/queries.test.ts
git commit -m "fix(agents): authoritative tool classification (traceloop.span.kind/gen_ai.tool.name/mcp tools-call)"
```

### Task 3: Fix the discovered-tools query MCP-lifecycle leak

**Files:**
- Modify: `ui/app/pages/Tools/queries.ts:99-114` (`buildDiscoveredToolsQuery`) and `:75-97` (`buildAgentToolDetailQuery` non-strict branch)
- Test: add to `ui/app/pages/Agents/queries.test.ts` (Tools queries live in Tools/queries.ts but share the suite is fine — or create `ui/app/pages/Tools/queries.test.ts`)

- [ ] **Step 1: Write the failing test**

Create `ui/app/pages/Tools/queries.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildDiscoveredToolsQuery } from "./queries";
import type { Timeframe } from "../../scope/types";

const TF: Timeframe = { from: "now()-2h" };

describe("buildDiscoveredToolsQuery — MCP lifecycle exclusion", () => {
  const q = buildDiscoveredToolsQuery(null, TF);

  it("excludes MCP protocol lifecycle calls from discovered tools", () => {
    expect(q).toContain('mcp.method.name != "tools/list"');
    expect(q).toContain('mcp.method.name != "initialize"');
  });

  it("still excludes the agent root and LLM spans", () => {
    expect(q).toContain("span.name != gen_ai.agent.name");
    expect(q).toContain("isNull(gen_ai.provider.name)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run app/pages/Tools/queries.test.ts`
Expected: FAIL — lifecycle exclusion strings not found.

- [ ] **Step 3: Add the lifecycle exclusion**

In `ui/app/pages/Tools/queries.ts`, in `buildDiscoveredToolsQuery`, after the line `| filter span.name != gen_ai.agent.name` (line 113), add:

```
| filter isNull(mcp.method.name) or (mcp.method.name != "tools/list" and mcp.method.name != "initialize" and mcp.method.name != "notifications/initialized" and mcp.method.name != "ping")
```

Apply the same added filter line to `buildAgentToolDetailQuery`'s non-strict `modeFilter` block (after its `isNull(gen_ai.provider.name)...` line at line 87).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ui && npx vitest run app/pages/Tools/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Validate against ualpre**

Run the emitted `buildDiscoveredToolsQuery(null, { from: "now()-2h" })` via `mcp__ualpre__execute-dql`; confirm no syntax error and that `tools/list` / `initialize` no longer appear in the `tool` column.

- [ ] **Step 6: Commit**

```bash
git add ui/app/pages/Tools/queries.ts ui/app/pages/Tools/queries.test.ts
git commit -m "fix(tools): exclude MCP lifecycle (initialize/tools-list) from discovered tools"
```

---

## Phase 3 — Trace-view tool misclassification

### Task 4: Fix `spanCategory` so task/lifecycle spans aren't tools

**Files:**
- Modify: `ui/app/pages/Prompts/TraceTree.tsx:22-27` (`spanCategory`)
- Modify: `ui/app/pages/Prompts/useTraceSpans.ts` (add `mcpMethod` to `TraceSpan` + row mapping)
- Modify: `ui/app/pages/Prompts/queries.ts:382-414` (`buildTraceSpansQuery` — add `mcp_method` field)
- Test: `ui/app/pages/Prompts/traceTopology.test.ts` (add a `spanCategory` describe) or new `ui/app/pages/Prompts/traceTree.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ui/app/pages/Prompts/traceTree.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { spanCategory } from "./TraceTree";
import type { TraceSpan } from "./useTraceSpans";

const base: TraceSpan = {
  spanId: "s", parentSpanId: null, name: "", service: "", durationMs: 0,
  timestampMs: 0, endTimeMs: null, isError: false, spanKind: null,
  statusCode: null, isRoot: null, endpoint: null, codeFunction: null,
  codeNamespace: null, cpuMs: null, cpuSelfMs: null, provider: null,
  model: null, operation: null, agentName: null, toolName: null,
  inTokens: 0, outTokens: 0, exceptionType: null, exceptionMsg: null,
  workflow: null, tlEntity: null, tlEntityPath: null, tlKind: null,
  sessionId: null, mcpMethod: null,
};

describe("spanCategory — tool classification", () => {
  it("treats traceloop.span.kind=tool and gen_ai.tool.name as tools", () => {
    expect(spanCategory({ ...base, tlKind: "tool" })).toBe("tool");
    expect(spanCategory({ ...base, toolName: "search_jira_issues" })).toBe("tool");
  });

  it("treats a real MCP tools/call as a tool", () => {
    expect(spanCategory({ ...base, name: "tools/call GetEmails", mcpMethod: "tools/call" })).toBe("tool");
  });

  it("does NOT treat traceloop.span.kind=task as a tool (it's orchestration)", () => {
    // continue_to_summarize, dynamic_summary_node etc. are LangGraph tasks.
    expect(spanCategory({ ...base, name: "continue_to_summarize", tlKind: "task" })).toBe("other");
  });

  it("does NOT treat MCP lifecycle as a tool", () => {
    expect(spanCategory({ ...base, name: "tools/list", mcpMethod: "tools/list" })).toBe("other");
    expect(spanCategory({ ...base, name: "initialize", mcpMethod: "initialize" })).toBe("other");
  });

  it("still classifies provider spans as llm and agent/workflow as agent", () => {
    expect(spanCategory({ ...base, provider: "openai" })).toBe("llm");
    expect(spanCategory({ ...base, tlKind: "workflow" })).toBe("agent");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run app/pages/Prompts/traceTree.test.ts`
Expected: FAIL — `mcpMethod` missing from type AND `task` currently returns `"tool"`.

- [ ] **Step 3: Add `mcpMethod` to the TraceSpan type and mapping**

In `ui/app/pages/Prompts/useTraceSpans.ts`, add to the `TraceSpan` interface after `sessionId` (line 45):

```typescript
  mcpMethod: string | null;
```

Add to the raw row type (after `session_id`) and to the row-mapping function (wherever `sessionId: str(r.session_id)` is built) a sibling:

```typescript
  mcpMethod: str(r.mcp_method) || null,
```

(Find the existing `sessionId:` mapping line and add `mcpMethod` immediately after it, using the same `str(...)` helper.)

- [ ] **Step 4: Add `mcp_method` to the trace-spans query**

In `ui/app/pages/Prompts/queries.ts`, inside `buildTraceSpansQuery`'s `| fields` block, add after `session_id = dt.rum.session.id` (line 412):

```
,
    mcp_method = mcp.method.name
```

- [ ] **Step 5: Rewrite `spanCategory`**

In `ui/app/pages/Prompts/TraceTree.tsx`, replace lines 22–27:

```typescript
/** Classify a span for the waterfall's color, label, and Indicators filter. */
export const spanCategory = (s: TraceSpan): SpanCategory => {
  if (s.provider) return "llm";
  if (s.agentName || s.tlKind === "workflow") return "agent";
  // MCP protocol lifecycle is never a tool call.
  const isLifecycle =
    s.mcpMethod === "tools/list" ||
    s.mcpMethod === "initialize" ||
    s.mcpMethod === "notifications/initialized" ||
    s.mcpMethod === "ping";
  const isTool =
    !isLifecycle &&
    (s.tlKind === "tool" || !!s.toolName || s.mcpMethod === "tools/call");
  if (isTool) return "tool";
  return "other";
};
```

(Note: `tlKind === "task"` and `name.endsWith(".task")` are intentionally removed — those are LangGraph orchestration nodes, not tools.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd ui && npx vitest run app/pages/Prompts/traceTree.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the existing trace-topology test to check for regressions**

Run: `cd ui && npx vitest run app/pages/Prompts/traceTopology.test.ts`
Expected: PASS (fix any test that assumed `task` = tool by updating it to the new, correct behavior).

- [ ] **Step 8: Commit**

```bash
git add ui/app/pages/Prompts/TraceTree.tsx ui/app/pages/Prompts/useTraceSpans.ts ui/app/pages/Prompts/queries.ts ui/app/pages/Prompts/traceTree.test.ts
git commit -m "fix(trace): task/MCP-lifecycle spans no longer misclassified as tools"
```

---

## Phase 4 — Framework field on the Agents table

### Task 5: Resolve framework per agent from raw signals

**Files:**
- Modify: `ui/app/pages/Agents/queries.ts:56-57` (collect raw signals instead of the always-null `gen_ai.framework`)
- Modify: `ui/app/pages/Agents/useAgents.ts:33` (raw row), `:88` (AgentRow type), `:217-237` (mapping) — resolve via `detectFrameworkFromSignals`
- Test: extend `ui/app/pages/Agents/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `ui/app/pages/Agents/queries.test.ts`:

```typescript
describe("buildAgentsQuery — framework signals", () => {
  it("collects traceloop workflow/entity + gen_ai.system instead of the empty gen_ai.framework", () => {
    const q = buildAgentsQuery(null, TF);
    expect(q).toContain("fw_workflow = takeFirst(traceloop.workflow.name)");
    expect(q).toContain("fw_entity = takeFirst(traceloop.entity.name)");
    expect(q).toContain("fw_system = takeFirst(gen_ai.system)");
    // The dead attribute must be gone.
    expect(q).not.toContain("framework = takeFirst(gen_ai.framework)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run app/pages/Agents/queries.test.ts -t "framework signals"`
Expected: FAIL.

- [ ] **Step 3: Swap the framework collection in the query**

In `ui/app/pages/Agents/queries.ts`, replace line 57 (`framework = takeFirst(gen_ai.framework),`) with:

```
    fw_workflow = takeFirst(traceloop.workflow.name),
    fw_entity = takeFirst(traceloop.entity.name),
    fw_system = takeFirst(gen_ai.system),
    fw_span = takeFirst(span.name),
```

- [ ] **Step 4: Run the query test to verify it passes**

Run: `cd ui && npx vitest run app/pages/Agents/queries.test.ts -t "framework signals"`
Expected: PASS.

- [ ] **Step 5: Write the failing mapping test**

Create `ui/app/pages/Agents/useAgents.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveAgentFramework } from "./useAgents";

describe("resolveAgentFramework", () => {
  it("labels LangGraph from the workflow name", () => {
    expect(resolveAgentFramework({ fw_workflow: "LangGraph" })).toBe("LangGraph");
  });
  it("labels CrewAI from gen_ai.system but never from openai", () => {
    expect(resolveAgentFramework({ fw_system: "crewai" })).toBe("CrewAI");
    expect(resolveAgentFramework({ fw_system: "openai" })).toBe(null);
  });
  it("returns null when unknown", () => {
    expect(resolveAgentFramework({})).toBe(null);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd ui && npx vitest run app/pages/Agents/useAgents.test.ts`
Expected: FAIL — `resolveAgentFramework` not exported.

- [ ] **Step 7: Implement the resolver and wire mapping**

In `ui/app/pages/Agents/useAgents.ts`:

Add imports at top:

```typescript
import { detectFrameworkFromSignals, FRAMEWORK_LABEL } from "../../detection/attributes";
```

Add the raw fields to the raw row interface (near line 33, alongside `avg_ttft_ms`):

```typescript
  fw_workflow?: string | null;
  fw_entity?: string | null;
  fw_system?: string | null;
  fw_span?: string | null;
```

Add an exported resolver (top-level, before the hook):

```typescript
/** Resolve a human framework label for an agent row, or null when unknown. */
export const resolveAgentFramework = (r: {
  fw_workflow?: string | null;
  fw_entity?: string | null;
  fw_system?: string | null;
  fw_span?: string | null;
}): string | null => {
  const id = detectFrameworkFromSignals({
    workflowName: r.fw_workflow,
    entityName: r.fw_entity,
    genAiSystem: r.fw_system,
    spanName: r.fw_span,
  });
  return id === "unknown" || id === "custom" ? null : FRAMEWORK_LABEL[id];
};
```

In the row mapping (line ~222 where `framework: r.framework ?? null` was), replace with:

```typescript
        framework: resolveAgentFramework(r),
```

(The `AgentRow.framework: string | null` field at line 88 already exists — keep it.)

- [ ] **Step 8: Run both tests to verify they pass**

Run: `cd ui && npx vitest run app/pages/Agents/useAgents.test.ts app/pages/Agents/queries.test.ts`
Expected: PASS.

- [ ] **Step 9: Validate against ualpre**

Run the emitted `buildAgentsQuery(null, { from: "now()-2h" })` via `mcp__ualpre__execute-dql`; confirm `fw_workflow` returns values like `LangGraph` / `RunnableSequence`.

- [ ] **Step 10: Render the framework badge in the table**

In `ui/app/pages/Agents/AgentsTable.tsx`, in the agent-name cell (find where `r.framework` would render — near the name column body), add next to the agent name when present:

```tsx
{r.framework && (
  <span
    style={{
      marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 6,
      background: "var(--surface-3)", color: "var(--text-2)", whiteSpace: "nowrap",
    }}
    title={`Orchestration framework: ${r.framework}`}
  >
    {r.framework}
  </span>
)}
```

- [ ] **Step 11: Commit**

```bash
git add ui/app/pages/Agents/queries.ts ui/app/pages/Agents/useAgents.ts ui/app/pages/Agents/useAgents.test.ts ui/app/pages/Agents/queries.test.ts ui/app/pages/Agents/AgentsTable.tsx
git commit -m "feat(agents): resolve & show orchestration framework per agent"
```

---

## Phase 5 — Trace completeness

### Task 6: AI-filtered trace fetch with a raised, configurable ceiling

**Files:**
- Modify: `ui/app/pages/Prompts/queries.ts:369-416` (`buildTraceSpansQuery`)
- Modify: `ui/app/pages/Prompts/useTraceSpans.ts` (expose `isTruncated`)
- Test: extend `ui/app/pages/Prompts/promptsQuery.test.ts` or new `ui/app/pages/Prompts/traceSpansQuery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ui/app/pages/Prompts/traceSpansQuery.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildTraceSpansQuery, TRACE_SPANS_LIMIT } from "./queries";

describe("buildTraceSpansQuery — AI filter + raised ceiling", () => {
  const q = buildTraceSpansQuery("7047d8bbdc8e032c358c75c5c1f4a473", 1781800000000);

  it("filters to AI-relevant spans so 1M-span traces don't drown the AI spans", () => {
    expect(q).toContain("isNotNull(gen_ai.agent.name)");
    expect(q).toContain("isNotNull(gen_ai.provider.name)");
    expect(q).toContain("isNotNull(traceloop.span.kind)");
    expect(q).toContain("isNotNull(mcp.method.name)");
  });

  it("raises the limit from 100 to the configured ceiling", () => {
    expect(TRACE_SPANS_LIMIT).toBeGreaterThanOrEqual(500);
    expect(q).toContain(`| limit ${TRACE_SPANS_LIMIT}`);
    expect(q).not.toContain("| limit 100");
  });

  it("still scopes by trace.id via toUid", () => {
    expect(q).toContain('toUid("7047d8bbdc8e032c358c75c5c1f4a473")');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ui && npx vitest run app/pages/Prompts/traceSpansQuery.test.ts`
Expected: FAIL — `TRACE_SPANS_LIMIT` not exported, no AI filter.

- [ ] **Step 3: Edit `buildTraceSpansQuery`**

In `ui/app/pages/Prompts/queries.ts`, above `buildTraceSpansQuery` add:

```typescript
/** Max AI spans returned per trace. Raised from 100 — real traces reach 1M+
 *  total spans, but only the AI-relevant subset matters here. */
export const TRACE_SPANS_LIMIT = 500;
```

After the `| filter trace.id == toUid(...)` line (line 376), insert the AI filter:

```
| filter isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.request.model) or isNotNull(gen_ai.tool.name) or isNotNull(traceloop.span.kind) or isNotNull(mcp.method.name)
```

Replace the final `| limit 100` (line 414) with:

```
| limit ${TRACE_SPANS_LIMIT}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd ui && npx vitest run app/pages/Prompts/traceSpansQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Expose `isTruncated` from the hook**

In `ui/app/pages/Prompts/useTraceSpans.ts`, wherever the hook returns its result object, add a derived flag (using the imported `TRACE_SPANS_LIMIT`):

```typescript
import { TRACE_SPANS_LIMIT } from "./queries";
// ... in the returned object:
isTruncated: spans.length >= TRACE_SPANS_LIMIT,
```

(Add `isTruncated: boolean` to the hook's return type.)

- [ ] **Step 6: Render the truncation callout**

In `ui/app/pages/Prompts/TraceModal.tsx` (the trace view container), when `isTruncated` is true, render above the topology/tree:

```tsx
{isTruncated && (
  <Text style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 8 }}>
    Showing the first {TRACE_SPANS_LIMIT} AI spans of a larger trace —
    non-AI infrastructure spans are filtered out.
  </Text>
)}
```

(Import `TRACE_SPANS_LIMIT` from `./queries` and thread `isTruncated` from `useTraceSpans`.)

- [ ] **Step 7: Validate against ualpre**

Run `buildTraceSpansQuery("7047d8bbdc8e032c358c75c5c1f4a473", <recent epoch ms>)` via `mcp__ualpre__execute-dql`. Confirm it returns ≤500 AI spans (not a 1M-span scan) with no syntax error. If the trace is older than the ±30m window, pick a fresh trace id from `fetch spans | summarize n=count(), by:{trace.id} | sort n desc`.

- [ ] **Step 8: Commit**

```bash
git add ui/app/pages/Prompts/queries.ts ui/app/pages/Prompts/useTraceSpans.ts ui/app/pages/Prompts/TraceModal.tsx ui/app/pages/Prompts/traceSpansQuery.test.ts
git commit -m "fix(trace): AI-filter trace fetch + raise ceiling to 500 with truncation note"
```

**CHECKPOINT — Phases 1–5 complete. The data is now correct. Build, typecheck, and review before the Pulse-map rework.**

Run: `cd ui && npx tsc --noEmit -p tsconfig.json && npx vitest run`

---

## Phase 6 — Agents-tab topology: reuse TraceTopology, single agent node

### Task 7: Merge duplicate service/agent nodes in the aggregate topology

**Files:**
- Modify: `ui/app/pages/Topology/useAggregateTopology.ts` (node-build/dedup step)
- Test: new `ui/app/pages/Topology/useAggregateTopology.test.ts`

- [ ] **Step 1: Inspect the node model**

Read `ui/app/pages/Topology/useAggregateTopology.ts` and note the `AggNode` shape and where nodes are keyed. The duplicate is: one node keyed on the AI-service (`service.name`) and one on the agent (`gen_ai.agent.name`) sharing the same display name.

- [ ] **Step 2: Write the failing test**

Create `ui/app/pages/Topology/useAggregateTopology.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mergeServiceAgentNodes, type AggNode } from "./useAggregateTopology";

const n = (id: string, tier: string, label: string): AggNode =>
  ({ id, tier, label, calls: 1 } as AggNode);

describe("mergeServiceAgentNodes", () => {
  it("collapses a service node and agent node that share a name into one agent node", () => {
    const nodes = [n("svc:bos-rfnds", "service", "bos-rfnds"), n("agent:bos-rfnds", "agent", "bos-rfnds")];
    const merged = mergeServiceAgentNodes(nodes);
    expect(merged).toHaveLength(1);
    expect(merged[0].tier).toBe("agent");
    expect(merged[0].label).toBe("bos-rfnds");
  });

  it("keeps distinct names separate", () => {
    const nodes = [n("svc:a", "service", "a"), n("agent:b", "agent", "b")];
    expect(mergeServiceAgentNodes(nodes)).toHaveLength(2);
  });
});
```

(Adjust the `AggNode` literal fields to match the real interface discovered in Step 1 — `tier` may be named `category`/`kind`; use the actual property names.)

- [ ] **Step 3: Run it to verify it fails**

Run: `cd ui && npx vitest run app/pages/Topology/useAggregateTopology.test.ts`
Expected: FAIL — `mergeServiceAgentNodes` not exported.

- [ ] **Step 4: Implement the merge**

In `ui/app/pages/Topology/useAggregateTopology.ts`, add an exported pure function (matching the real `AggNode` field names):

```typescript
/** Collapse a service node and an agent node that share a display name into a
 *  single agent node, re-pointing edges. Fixes the duplicate blue/purple bubble:
 *  OTel gives the AI service and the agent the same service.name. */
export const mergeServiceAgentNodes = (nodes: AggNode[]): AggNode[] => {
  const agentLabels = new Set(nodes.filter((x) => x.tier === "agent").map((x) => x.label));
  return nodes.filter((x) => !(x.tier === "service" && agentLabels.has(x.label)));
};
```

Then call it where nodes are finalized in the hook (after the node list is built, before edges are returned), and re-key any edge whose endpoint was a removed service node onto the surviving agent node id. Locate the edge-build step and map removed `svc:<label>` ids to `agent:<label>`.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd ui && npx vitest run app/pages/Topology/useAggregateTopology.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/app/pages/Topology/useAggregateTopology.ts ui/app/pages/Topology/useAggregateTopology.test.ts
git commit -m "fix(topology): merge duplicate service+agent bubbles into one agent node"
```

### Task 8: Point the Agents-tab topology at the trace-level view

**Files:**
- Modify: `ui/app/pages/Agents/AgentTopologySubview.tsx`
- Reuse: `ui/app/pages/Prompts/TraceTopology.tsx`, `ui/app/pages/Prompts/useTraceSpans.ts`

- [ ] **Step 1: Add a query to resolve a representative trace id for an agent**

In `ui/app/pages/Agents/queries.ts`, add:

```typescript
/** Most-recent trace id that carries this agent's name — used to seed the
 *  Agents-tab trace topology. */
export const buildAgentLatestTraceQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  agentName: string,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter gen_ai.agent.name == "${dqlEscape(agentName)}"
| summarize ts = max(start_time), by: { trace.id }
| sort ts desc
| limit 1
| fieldsAdd trace_id = toString(trace.id), start_ms = toLong(ts) / 1000000
| fields trace_id, start_ms
`.trim();
```

- [ ] **Step 2: Validate the query against ualpre**

Run `buildAgentLatestTraceQuery(null, { from: "now()-2h" }, "bos-pp-anc-rt")` via `mcp__ualpre__execute-dql`; confirm it returns one `trace_id` + `start_ms`.

- [ ] **Step 3: Rewrite `AgentTopologySubview` to render TraceTopology**

Replace the body of `ui/app/pages/Agents/AgentTopologySubview.tsx` so it: (a) runs `buildAgentLatestTraceQuery` via `useScopedDql` for the agent, (b) feeds the resolved `trace_id`/`start_ms` to `useTraceSpans`, (c) renders `TraceTopology` with those spans. Keep the existing `Skeleton` loading and `EmptyState` empty paths.

```tsx
import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { buildAgentLatestTraceQuery } from "./queries";
import { useTraceSpans } from "../Prompts/useTraceSpans";
import { TraceTopology } from "../Prompts/TraceTopology";

export const AgentTopologySubview = ({
  agentName,
  height = 460,
}: {
  agentName: string;
  height?: number;
}) => {
  const { serviceIds, timeframe } = useScope();
  const traceQ = useScopedDql<{ trace_id?: string; start_ms?: number }>(
    buildAgentLatestTraceQuery(serviceIds, timeframe, agentName),
    { staleTime: 60_000 },
  );
  const rec = traceQ.data?.records?.[0];
  const traceId = rec?.trace_id ?? null;
  const startMs = typeof rec?.start_ms === "number" ? rec.start_ms : undefined;

  const spans = useTraceSpans(traceId, startMs);

  if (traceQ.isLoading || (traceId && spans.isLoading))
    return <Skeleton style={{ height, borderRadius: 10 }} />;

  if (!traceId || spans.spans.length === 0)
    return (
      <EmptyState
        bare
        title="No call topology for this agent"
        description="No recent trace carries this agent's name in the current scope, so there's nothing to graph."
      />
    );

  return (
    <div style={{ width: "100%" }}>
      <TraceTopology spans={spans.spans} isTruncated={spans.isTruncated} />
    </div>
  );
};
```

(Verify the real `useScope()` hook name/exports and `useTraceSpans` signature in Step 1 of Task 6; adjust the import/usage to match. If `TraceTopology`'s prop is not named `spans`, read its props at `ui/app/pages/Prompts/TraceTopology.tsx` and pass accordingly. If `TraceTopology` does not currently accept `isTruncated`, add an optional prop with a default.)

- [ ] **Step 4: Typecheck**

Run: `cd ui && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. Fix prop/hook-name mismatches surfaced here.

- [ ] **Step 5: Commit**

```bash
git add ui/app/pages/Agents/AgentTopologySubview.tsx ui/app/pages/Agents/queries.ts
git commit -m "feat(agents): embed trace-level topology (single agent node) in the Agents tab"
```

---

## Phase 7 — Pulse "AI Application Architecture": framework boxes + global filter

### Task 9: Framework breakdown query + hook

**Files:**
- Create: `ui/app/pages/Pulse/archMap/frameworkBreakdown.ts` (query + types)
- Create: `ui/app/pages/Pulse/archMap/useFrameworkBreakdown.ts` (hook)
- Test: `ui/app/pages/Pulse/archMap/frameworkBreakdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ui/app/pages/Pulse/archMap/frameworkBreakdown.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildFrameworkBreakdownQuery, rowsToFrameworks } from "./frameworkBreakdown";
import type { Timeframe } from "../../../scope/types";

const TF: Timeframe = { from: "now()-2h" };

describe("buildFrameworkBreakdownQuery", () => {
  const q = buildFrameworkBreakdownQuery(null, TF);
  it("groups by the raw framework signals", () => {
    expect(q).toContain("traceloop.workflow.name");
    expect(q).toContain("gen_ai.system");
    expect(q).toContain("n = count()");
  });
});

describe("rowsToFrameworks", () => {
  it("aggregates raw rows into labeled, deduped frameworks with counts", () => {
    const rows = [
      { wf: "LangGraph", system: null, n: 100 },
      { wf: "RunnableSequence", system: null, n: 20 },
      { wf: null, system: "crewai", n: 5 },
      { wf: null, system: "openai", n: 999 }, // provider, not a framework → dropped
    ];
    const fw = rowsToFrameworks(rows);
    const byLabel = Object.fromEntries(fw.map((f) => [f.label, f.count]));
    expect(byLabel["LangGraph"]).toBe(100);
    expect(byLabel["LangChain"]).toBe(20);
    expect(byLabel["CrewAI"]).toBe(5);
    expect(byLabel["OpenAI"]).toBeUndefined();
    expect(byLabel["Unknown"]).toBeUndefined();
  });

  it("sorts by count descending", () => {
    const fw = rowsToFrameworks([
      { wf: "RunnableSequence", system: null, n: 1 },
      { wf: "LangGraph", system: null, n: 50 },
    ]);
    expect(fw[0].label).toBe("LangGraph");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ui && npx vitest run app/pages/Pulse/archMap/frameworkBreakdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the query + aggregation**

Create `ui/app/pages/Pulse/archMap/frameworkBreakdown.ts`:

```typescript
import { dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";
import { detectFrameworkFromSignals, FRAMEWORK_LABEL, type FrameworkId } from "../../../detection/attributes";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/** Distinct framework signals in scope with span counts. */
export const buildFrameworkBreakdownQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(traceloop.workflow.name) or isNotNull(traceloop.entity.name) or isNotNull(gen_ai.system)
| summarize n = count(), by: { wf = traceloop.workflow.name, entity = traceloop.entity.name, system = gen_ai.system }
| sort n desc
| limit 200
`.trim();

export interface FrameworkRow {
  wf?: string | null;
  entity?: string | null;
  system?: string | null;
  n?: number | string | null;
}

export interface DetectedFramework {
  id: FrameworkId;
  label: string;
  count: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

/** Fold raw signal rows into labeled frameworks, dropping provider-only/unknown. */
export const rowsToFrameworks = (rows: FrameworkRow[]): DetectedFramework[] => {
  const acc = new Map<FrameworkId, number>();
  for (const r of rows) {
    const id = detectFrameworkFromSignals({
      workflowName: r.wf,
      entityName: r.entity,
      genAiSystem: r.system,
    });
    if (id === "unknown" || id === "custom") continue;
    acc.set(id, (acc.get(id) ?? 0) + num(r.n));
  }
  return [...acc.entries()]
    .map(([id, count]) => ({ id, label: FRAMEWORK_LABEL[id], count }))
    .sort((a, b) => b.count - a.count);
};
```

Create `ui/app/pages/Pulse/archMap/useFrameworkBreakdown.ts`:

```typescript
import { useMemo } from "react";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import {
  buildFrameworkBreakdownQuery,
  rowsToFrameworks,
  type FrameworkRow,
  type DetectedFramework,
} from "./frameworkBreakdown";

export const useFrameworkBreakdown = (): {
  frameworks: DetectedFramework[];
  isLoading: boolean;
} => {
  const { serviceIds, timeframe } = useScope();
  const q = useScopedDql<FrameworkRow>(
    buildFrameworkBreakdownQuery(serviceIds, timeframe),
    { staleTime: 60_000 },
  );
  const frameworks = useMemo(
    () => rowsToFrameworks(q.data?.records ?? []),
    [q.data],
  );
  return { frameworks, isLoading: q.isLoading };
};
```

(Verify `useScope()` exports `serviceIds` + `timeframe`; if the project uses a different scope hook for Pulse, match it — see how `useArchitectureData.ts` reads scope and reuse that pattern.)

- [ ] **Step 4: Run it to verify it passes**

Run: `cd ui && npx vitest run app/pages/Pulse/archMap/frameworkBreakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Validate against ualpre**

Run `buildFrameworkBreakdownQuery(null, { from: "now()-2h" })` via `mcp__ualpre__execute-dql`; confirm rows include `wf=LangGraph` and `wf=RunnableSequence`.

- [ ] **Step 6: Commit**

```bash
git add ui/app/pages/Pulse/archMap/frameworkBreakdown.ts ui/app/pages/Pulse/archMap/useFrameworkBreakdown.ts ui/app/pages/Pulse/archMap/frameworkBreakdown.test.ts
git commit -m "feat(pulse): framework-breakdown query + hook for the architecture map"
```

### Task 10: Render framework filter chips on the Orchestrator tier; fold orch spans into Agent

**Files:**
- Create: `ui/app/pages/Pulse/archMap/FrameworkChips.tsx`
- Modify: `ui/app/pages/Pulse/archMap/NodeMap.tsx` (render chips across the orchestrator tier)
- Modify: `ui/app/pages/Pulse/archMap/usePulseSeries.ts:314-320` (move the orchestrator's `orch`/`wf` runtime count into the agent tier headline)
- Modify: `ui/app/scope/GlobalFilterContext.tsx` (add a `frameworks` dimension to the global filter, mirroring `agents`)

- [ ] **Step 1: Read the global filter shape**

Read `ui/app/scope/GlobalFilterContext.tsx` and `ui/app/scope/queries.ts` (`globalFilterClauses` + `GlobalFilters`). Note how the `agents` dimension injects `in(gen_ai.agent.name, array(...))`. The framework dimension will mirror this, injecting a trace-scoped filter on `traceloop.workflow.name` / `gen_ai.system` via the same resolver path documented in memory `global-filter-trace-scoping`.

- [ ] **Step 2: Add a `frameworks` dimension to GlobalFilters**

In `ui/app/scope/queries.ts`, extend the `GlobalFilters` interface with:

```typescript
  /** Selected orchestration framework labels (LangGraph, LangChain, …). */
  frameworks?: string[];
```

In `globalFilterClauses`, add a clause that resolves selected framework labels back to their signal values and injects them. Because one label (LangChain) maps to multiple workflow names (`RunnableSequence`, `AgentExecutor`), build the predicate from a label→patterns map:

```typescript
// Framework filter: label → the workflow/system values that resolve to it.
const FRAMEWORK_FILTER_VALUES: Record<string, { wf?: string[]; system?: string[] }> = {
  LangGraph: { wf: ["LangGraph"] },
  LangChain: { wf: ["RunnableSequence", "AgentExecutor"], system: ["langchain"] },
  CrewAI: { system: ["crewai"] },
  Agno: { system: ["agno"] },
  LlamaIndex: { wf: ["llama_index_query_pipeline"] },
  Haystack: { wf: ["haystack_pipeline"] },
  "OpenAI Agents SDK": { wf: ["Agent Workflow"] },
};
```

Emit, for the selected labels, a disjunction like:
`| filter in(traceloop.workflow.name, array("LangGraph","RunnableSequence","AgentExecutor")) or in(gen_ai.system, array("crewai"))`
(only including the arms for the selected labels; skip the clause entirely when `frameworks` is empty).

- [ ] **Step 3: Build the FrameworkChips component**

Create `ui/app/pages/Pulse/archMap/FrameworkChips.tsx`:

```tsx
import React from "react";
import type { DetectedFramework } from "./frameworkBreakdown";

const MAX_VISIBLE = 5;

export const FrameworkChips = ({
  frameworks,
  selected,
  onToggle,
}: {
  frameworks: DetectedFramework[];
  selected: Set<string>;
  onToggle: (label: string) => void;
}) => {
  if (frameworks.length === 0) return null;
  const visible = frameworks.slice(0, MAX_VISIBLE);
  const overflow = frameworks.length - visible.length;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
      {visible.map((f) => {
        const active = selected.has(f.label);
        return (
          <button
            key={f.id}
            onClick={() => onToggle(f.label)}
            title={`${f.label} — ${f.count.toLocaleString()} spans. Click to filter the page.`}
            style={{
              fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 8,
              cursor: "pointer",
              border: active ? "2px solid var(--blue)" : "1px solid var(--border)",
              background: active ? "color-mix(in oklab, var(--blue) 12%, transparent)" : "var(--surface-2)",
              color: active ? "var(--blue)" : "var(--text)",
            }}
          >
            {f.label}
          </button>
        );
      })}
      {overflow > 0 && (
        <span style={{ fontSize: 12, color: "var(--text-3)", alignSelf: "center" }}>
          +{overflow} more
        </span>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Render the chips on the Orchestrator tier and wire the filter**

In `ui/app/pages/Pulse/archMap/NodeMap.tsx`, where the `orchestrator` tier node renders, render `<FrameworkChips>` across that tier using `useFrameworkBreakdown()`. Wire `selected` to the global filter's `frameworks` dimension and `onToggle` to add/remove a label (read+write via the global-filter context discovered in Step 1). Selecting a chip updates the page-wide filter; the chip reflects the current selection.

```tsx
// near other hooks in NodeMap:
const { frameworks } = useFrameworkBreakdown();
const { filters, setFilters } = useGlobalFilter(); // match the real context API
const selected = new Set(filters.frameworks ?? []);
const toggleFramework = (label: string) => {
  const next = new Set(selected);
  next.has(label) ? next.delete(label) : next.add(label);
  setFilters({ ...filters, frameworks: [...next] });
};
// ...in the orchestrator tier cell:
<FrameworkChips frameworks={frameworks} selected={selected} onToggle={toggleFramework} />
```

(Match the real global-filter context hook/setter names found in Step 1.)

- [ ] **Step 5: Fold the orchestrator runtime count into the Agent tier**

In `ui/app/pages/Pulse/archMap/usePulseSeries.ts`, at the orchestrator block (lines 314–320), stop using the workflow/runtime span count `wf` as the orchestrator headline count. Instead add it to the agent tier's count, and set the orchestrator tier's headline to the number of detected frameworks (passed in from `useFrameworkBreakdown`, or a simple "N frameworks" sub-line). Concretely:
- Remove `count.orchestrator = wf;` (line 318) and add `count.agent = (count.agent ?? 0) + wf;`
- Leave `p90.orchestrator` / `errCount.orchestrator` as-is (still useful for the tier health dot) OR move them to agent if the tier no longer shows a metric — keep the health dot, drop the throughput headline.
- Update the orchestrator `nodes.orchestrator` builder (line 332+) so its `headline` is unset and its `sub` reads "frameworks detected" (the FrameworkChips supply the actual list).

- [ ] **Step 6: Typecheck + run the full suite**

Run: `cd ui && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add ui/app/pages/Pulse/archMap/FrameworkChips.tsx ui/app/pages/Pulse/archMap/NodeMap.tsx ui/app/pages/Pulse/archMap/usePulseSeries.ts ui/app/scope/queries.ts ui/app/scope/GlobalFilterContext.tsx
git commit -m "feat(pulse): orchestrator tier shows framework filter chips; runtime spans fold into agent tier"
```

---

## Phase 8 — Ship

### Task 11: Version bump, full verification, deploy

- [ ] **Step 1: Bump the app version**

In `app.config.json`, bump `app.version` from `0.1.78` to `0.1.79`. Leave `environmentUrl` as the placeholder `https://your-tenant.apps.dynatrace.com/` in the commit (set it to ualpre only locally for the deploy, then revert — per the sanitization rule).

- [ ] **Step 2: Full verification**

Run: `cd ui && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint .`
Expected: all clean.

- [ ] **Step 3: Commit + push + PR**

```bash
git add app.config.json
git commit -m "chore: bump to 0.1.79 for tool/framework/topology/trace fixes"
git push origin redesign-5-tab
```

Open/update the PR with a summary referencing the spec and this plan.

- [ ] **Step 4: Deploy to ualpre**

Locally set `environmentUrl` to `https://ualpre.apps.dynatrace.com/`, run `npm run deploy`, confirm "App is deployed", then revert `environmentUrl` to the placeholder (do not commit the real URL).

- [ ] **Step 5: Manual smoke check (use the `verify` skill)**

In the deployed app confirm: (a) Agents table shows framework badges; (b) a tool-heavy agent's TTFT/tool counts no longer include `initialize`/`tools/list`; (c) Agents-tab topology shows ONE agent bubble with tool/LLM edges; (d) a large trace shows the truncation note and renders ≤500 AI spans; (e) Pulse Orchestrator tier shows framework chips that filter the page when clicked.

---

## Self-Review Notes (completed)

- **Spec coverage:** Tool detection → Tasks 2,3,4. Framework ID → Tasks 1,5,9. Pulse map → Tasks 9,10. Topology dedup/reuse → Tasks 7,8. Trace completeness → Task 6. All five spec sections have tasks.
- **`gen_ai.system` overload** is enforced in Task 1 (value-mapped) and re-tested in Tasks 5 and 9 (provider value `openai` must NOT become a framework).
- **MCP lifecycle** exclusion appears in Tasks 2, 3, and 4 (DQL and trace-view paths).
- **Type consistency:** `FrameworkId` / `FRAMEWORK_LABEL` / `detectFrameworkFromSignals` / `DetectedFramework` / `rowsToFrameworks` names are used identically across Tasks 1, 5, 9, 10.
- **Known follow-ups flagged inline:** several UI tasks (8, 10) say "verify the real hook/prop names" because the exact Strato/context APIs must be read at execution time — these are read-then-match instructions, not placeholders.

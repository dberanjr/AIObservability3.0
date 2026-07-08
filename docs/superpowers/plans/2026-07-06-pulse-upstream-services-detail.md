# Pulse Upstream Services Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Pulse arch-map Client-node drawer with a near-full-screen modal showing golden signals for all upstream caller services, a top-8 P90-over-time chart, Smartscape links, and a fresh 3-column caller→AI-service→component flow map.

**Architecture:** New self-contained modal (`UpstreamServicesModal`) fetches its own data via a new `useUpstreamDetail` hook (reusing/extending the existing upstream query builders), composes three presentational sections, and owns a single `selectedCallerId` that spotlights the selected caller across all three. Pure logic (graph assembly, top-N, sort, Smartscape URL) lives in tested helper modules. `ArchitectureMap` opens the modal when the Client node is picked and suppresses the drawer for that tier only.

**Tech Stack:** React + TypeScript, `@dynatrace-sdk/react-hooks` (`useDql`) + `useScopedDql`, DQL (spans + smartscape), Strato components, existing arch-map CSS/tokens, Vitest.

## Global Constraints

- Branch `redesign-5-tab`. All work is additive; the fleet-wide arch map is untouched.
- **Fidelity is topology-level.** Never imply per-request/per-trace attribution. No per-caller cost column.
- **Smartscape id filters must use `toString()`** — `smartscapeEdges` `source_id`/`target_id` are `smartscape_id`-typed; `in(target_id, array("SERVICE-…"))` silently matches nothing without it (see `memory/smartscape-id-string-mismatch.md`).
- Hover/tooltip values use the correct unit formatters (`fmtMs` durations, `fmtCount` grouped counts, `fmtPercent`) per the chart-tooltip-units convention.
- Self-fetching bodies branch on `error` before empty, and pass `limitHit` into `emptyCause` (STATE-2/STATE-4 conventions).
- Verify gates before any deploy: `npm run typecheck` (clean), `npm test` (all pass), `npm run build` (passes). Deploy to ualpre per the standing redeploy rule (set `environmentUrl`→ualpre, `npm run deploy`, revert to placeholder).
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

Create (all under `ui/app/pages/Pulse/archMap/`):
- `upstreamDetailQueries.ts` — new DQL builders: caller→service edge pairs, P90 timeseries, per-service component rollup.
- `upstreamDetailQueries.test.ts` — query-string tests.
- `upstreamGraph.ts` — pure helpers: `assembleUpstreamGraph`, `topCallersByVolume`, `sortCallers`.
- `upstreamGraph.test.ts` — unit tests.
- `smartscapeUrl.ts` — `smartscapeEntityUrl(entityId)`.
- `smartscapeUrl.test.ts` — unit tests.
- `useUpstreamDetail.ts` — orchestrating hook.
- `UpstreamServicesModal.tsx` — modal shell + `selectedCallerId` state.
- `UpstreamGoldenSignalsTable.tsx` — CSS-grid golden-signals table.
- `UpstreamP90Chart.tsx` — multi-line P90 chart, top-8 + show-all.
- `UpstreamFlowMap.tsx` — fresh 3-column layered flow.

Modify:
- `ui/app/pages/Pulse/archMap/clientUpstreamQueries.ts` — add `p95ns` to `buildUpstreamRedQuery`.
- `ui/app/pages/Pulse/ArchitectureMap.tsx:408-431` — open the modal for the Client node; suppress the drawer for that tier.

## Shared Types (defined in Task 2, consumed everywhere)

```ts
// upstreamGraph.ts
export interface UpstreamCaller {
  id: string;               // dt.entity.service id
  name: string;
  requests: number;
  errPct: number;
  p90Ms: number;
  p95Ms: number;
  throughputPerMin: number;
  aiServiceIds: string[];   // AI services this caller calls (from edges)
}
export interface AiServiceNode {
  id: string;
  name: string;
  agents: string[];
  tools: string[];
  models: string[];
}
export interface CallerEdge { upstreamId: string; aiServiceId: string }
export interface UpstreamGraph {
  callers: UpstreamCaller[];
  services: AiServiceNode[];
  edges: CallerEdge[];
}
```

---

### Task 1: Query builders (edge pairs, P90 series, component rollup) + P95 extension

**Files:**
- Modify: `ui/app/pages/Pulse/archMap/clientUpstreamQueries.ts:42-48` (add `p95ns`)
- Create: `ui/app/pages/Pulse/archMap/upstreamDetailQueries.ts`
- Test: `ui/app/pages/Pulse/archMap/upstreamDetailQueries.test.ts`

**Interfaces:**
- Consumes: `dqlIdArray`, `dqlTimeArg` from `../../../scope/queries`; `Timeframe`, `GlobalFilters` from `../../../scope/types`; `globalFilterClauses`, `scopeFilterClause` unused here.
- Produces:
  - `buildUpstreamEdgePairsQuery(aiServiceIds: string[]): string` → rows `{ upstreamId, upstream, aiServiceId, aiService }`
  - `buildUpstreamP90SeriesQuery(upstreamIds: string[], timeframe: Timeframe): string` → rows `{ svcId, p90ns: (number|null)[] }`
  - `buildServiceComponentsQuery(aiServiceIds: string[], timeframe: Timeframe): string` → rows `{ svcId, agents, tools, models }`
  - `buildUpstreamRedQuery` gains `p95ns = percentile(duration, 95)` in its `summarize`.

- [ ] **Step 1: Write the failing test**

```ts
// ui/app/pages/Pulse/archMap/upstreamDetailQueries.test.ts
import { describe, it, expect } from "vitest";
import {
  buildUpstreamEdgePairsQuery,
  buildUpstreamP90SeriesQuery,
  buildServiceComponentsQuery,
} from "./upstreamDetailQueries";
import { buildUpstreamRedQuery } from "./clientUpstreamQueries";

const IDS = ["SERVICE-AAA", "SERVICE-BBB"];
const TF = { from: "now()-24h" } as const;

describe("upstreamDetailQueries", () => {
  it("edge pairs filter target_id via toString and emit source/target names", () => {
    const q = buildUpstreamEdgePairsQuery(IDS);
    expect(q).toContain('smartscapeEdges type:"calls"');
    expect(q).toContain("in(toString(target_id), array(");
    expect(q).toContain("upstream = `s.upstream`");
    expect(q).toContain("aiService = `t.target_name`");
    expect(q).not.toContain("countDistinct"); // pairs, not counts
  });

  it("edge pairs query is empty for no ids", () => {
    expect(buildUpstreamEdgePairsQuery([])).toBe("");
  });

  it("p90 series makes a per-service percentile timeseries", () => {
    const q = buildUpstreamP90SeriesQuery(IDS, TF);
    expect(q).toContain("in(dt.entity.service, array(");
    expect(q).toContain("makeTimeseries");
    expect(q).toContain("p90ns = percentile(duration, 90)");
    expect(q).toContain("by: { svcId = dt.entity.service }");
  });

  it("component rollup collects agents/tools/models per service", () => {
    const q = buildServiceComponentsQuery(IDS, TF);
    expect(q).toContain("in(dt.entity.service, array(");
    expect(q).toContain("agents = collectDistinct(gen_ai.agent.name)");
    expect(q).toContain("tools = collectDistinct(gen_ai.tool.name)");
    expect(q).toContain("models = collectDistinct(gen_ai.request.model)");
    expect(q).toContain("by: { svcId = dt.entity.service }");
  });

  it("RED query now also emits p95", () => {
    expect(buildUpstreamRedQuery(IDS, TF)).toContain("p95ns = percentile(duration, 95)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run ui/app/pages/Pulse/archMap/upstreamDetailQueries.test.ts`
Expected: FAIL — `upstreamDetailQueries` module not found / exports undefined.

- [ ] **Step 3: Add `p95ns` to `buildUpstreamRedQuery`**

In `clientUpstreamQueries.ts`, edit the `summarize` (lines 42-46) to add the p95 line after `p90ns`:

```ts
| summarize
    requests = count(),
    errors = sum(is_err),
    p90ns = percentile(duration, 90),
    p95ns = percentile(duration, 95),
    by: { svcId = dt.entity.service, svc = entityName(dt.entity.service) }
```

- [ ] **Step 4: Create `upstreamDetailQueries.ts`**

```ts
// ui/app/pages/Pulse/archMap/upstreamDetailQueries.ts
import { dqlIdArray, dqlTimeArg } from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/** Caller→AI-service edge PAIRS (not counts) for drawing the flow. Smartscape
 *  target_id is a smartscape-id type — filter via toString(). */
export const buildUpstreamEdgePairsQuery = (aiServiceIds: string[]): string => {
  if (aiServiceIds.length === 0) return "";
  return `
smartscapeEdges type:"calls"
| filter in(toString(target_id), array(${dqlIdArray(aiServiceIds)}))
| join [ smartscapeNodes type:"SERVICE" | fields source_id = id, upstream = name ], kind: inner, on: { source_id }, prefix: "s."
| join [ smartscapeNodes type:"SERVICE" | fields target_id = id, target_name = name ], kind: inner, on: { target_id }, prefix: "t."
| fields upstreamId = toString(source_id), upstream = \`s.upstream\`, aiServiceId = toString(target_id), aiService = \`t.target_name\`
| limit 500
`.trim();
};

/** Per-caller P90 latency timeseries for the multi-line chart. */
export const buildUpstreamP90SeriesQuery = (
  upstreamIds: string[],
  timeframe: Timeframe,
): string => {
  if (upstreamIds.length === 0) return "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter in(dt.entity.service, array(${dqlIdArray(upstreamIds)}))
| makeTimeseries p90ns = percentile(duration, 90), by: { svcId = dt.entity.service }
`.trim();
};

/** Per-AI-service component rollup: distinct agents / tools / models. */
export const buildServiceComponentsQuery = (
  aiServiceIds: string[],
  timeframe: Timeframe,
): string => {
  if (aiServiceIds.length === 0) return "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter in(dt.entity.service, array(${dqlIdArray(aiServiceIds)}))
| filter isNotNull(gen_ai.request.model) or isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.tool.name)
| summarize
    agents = collectDistinct(gen_ai.agent.name),
    tools = collectDistinct(gen_ai.tool.name),
    models = collectDistinct(gen_ai.request.model),
    by: { svcId = dt.entity.service }
| limit 200
`.trim();
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run ui/app/pages/Pulse/archMap/upstreamDetailQueries.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add ui/app/pages/Pulse/archMap/upstreamDetailQueries.ts ui/app/pages/Pulse/archMap/upstreamDetailQueries.test.ts ui/app/pages/Pulse/archMap/clientUpstreamQueries.ts
git commit -m "feat(pulse): upstream detail query builders + p95 extension

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pure graph/sort/top-N helpers

**Files:**
- Create: `ui/app/pages/Pulse/archMap/upstreamGraph.ts`
- Test: `ui/app/pages/Pulse/archMap/upstreamGraph.test.ts`

**Interfaces:**
- Consumes: nothing external (pure). Raw record shapes are inputs.
- Produces (also exports the Shared Types above):
  - `assembleUpstreamGraph(input): UpstreamGraph`
  - `topCallersByVolume(callers: UpstreamCaller[], n: number): Set<string>` (ids)
  - `sortCallers(callers: UpstreamCaller[], key: SortKey, dir: "asc"|"desc"): UpstreamCaller[]`
  - `type SortKey = "name"|"requests"|"errPct"|"p90Ms"|"p95Ms"|"throughputPerMin"|"aiServices"`

- [ ] **Step 1: Write the failing test**

```ts
// ui/app/pages/Pulse/archMap/upstreamGraph.test.ts
import { describe, it, expect } from "vitest";
import { assembleUpstreamGraph, topCallersByVolume, sortCallers } from "./upstreamGraph";

const reds = [
  { svcId: "S1", svc: "alpha", requests: 100, errors: 1, p90ns: 9_000_000, p95ns: 14_000_000 },
  { svcId: "S2", svc: "bravo", requests: 300, errors: 0, p90ns: 2_000_000, p95ns: 3_000_000 },
];
const edges = [
  { upstreamId: "S1", upstream: "alpha", aiServiceId: "A1", aiService: "svc-a" },
  { upstreamId: "S2", upstream: "bravo", aiServiceId: "A1", aiService: "svc-a" },
  { upstreamId: "S2", upstream: "bravo", aiServiceId: "A2", aiService: "svc-b" },
];
const comps = [
  { svcId: "A1", agents: ["planner"], tools: ["sql"], models: ["Claude Sonnet 4.6"] },
  { svcId: "A2", agents: [], tools: [], models: ["Titan Embed"] },
];

describe("assembleUpstreamGraph", () => {
  it("builds callers with derived rates, aiServiceIds, and dedup services", () => {
    const g = assembleUpstreamGraph({ reds, edges, components: comps, windowMinutes: 60 });
    const s1 = g.callers.find((c) => c.id === "S1")!;
    expect(s1.errPct).toBeCloseTo(1); // 1/100
    expect(s1.p90Ms).toBe(9);
    expect(s1.p95Ms).toBe(14);
    expect(s1.throughputPerMin).toBeCloseTo(100 / 60);
    const s2 = g.callers.find((c) => c.id === "S2")!;
    expect(s2.aiServiceIds.sort()).toEqual(["A1", "A2"]);
    expect(g.services.map((s) => s.id).sort()).toEqual(["A1", "A2"]);
    expect(g.services.find((s) => s.id === "A1")!.models).toEqual(["Claude Sonnet 4.6"]);
    expect(g.edges.length).toBe(3);
  });

  it("callers with no RED row still appear from edges (quiet callers)", () => {
    const g = assembleUpstreamGraph({
      reds: [],
      edges: [{ upstreamId: "S9", upstream: "quiet", aiServiceId: "A1", aiService: "svc-a" }],
      components: [],
      windowMinutes: 60,
    });
    expect(g.callers.find((c) => c.id === "S9")?.name).toBe("quiet");
    expect(g.callers[0].requests).toBe(0);
  });
});

describe("topCallersByVolume", () => {
  it("returns the ids of the N highest-request callers", () => {
    const callers = [
      { id: "a", requests: 5 }, { id: "b", requests: 50 }, { id: "c", requests: 10 },
    ] as any;
    expect(topCallersByVolume(callers, 2)).toEqual(new Set(["b", "c"]));
  });
});

describe("sortCallers", () => {
  it("sorts by name asc and requests desc", () => {
    const callers = [
      { id: "1", name: "b", requests: 1 }, { id: "2", name: "a", requests: 9 },
    ] as any;
    expect(sortCallers(callers, "name", "asc").map((c) => c.name)).toEqual(["a", "b"]);
    expect(sortCallers(callers, "requests", "desc").map((c) => c.id)).toEqual(["2", "1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run ui/app/pages/Pulse/archMap/upstreamGraph.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `upstreamGraph.ts`**

```ts
// ui/app/pages/Pulse/archMap/upstreamGraph.ts
export interface UpstreamCaller {
  id: string; name: string; requests: number; errPct: number;
  p90Ms: number; p95Ms: number; throughputPerMin: number; aiServiceIds: string[];
}
export interface AiServiceNode { id: string; name: string; agents: string[]; tools: string[]; models: string[] }
export interface CallerEdge { upstreamId: string; aiServiceId: string }
export interface UpstreamGraph { callers: UpstreamCaller[]; services: AiServiceNode[]; edges: CallerEdge[] }

export type SortKey =
  | "name" | "requests" | "errPct" | "p90Ms" | "p95Ms" | "throughputPerMin" | "aiServices";

interface RedRow { svcId?: string; svc?: string; requests?: number; errors?: number; p90ns?: number; p95ns?: number }
interface EdgeRow { upstreamId?: string; upstream?: string; aiServiceId?: string; aiService?: string }
interface CompRow { svcId?: string; agents?: (string|null)[]; tools?: (string|null)[]; models?: (string|null)[] }

const clean = (a?: (string | null)[]): string[] =>
  (a ?? []).filter((s): s is string => typeof s === "string" && s.length > 0);
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const assembleUpstreamGraph = (input: {
  reds: RedRow[]; edges: EdgeRow[]; components: CompRow[]; windowMinutes: number;
}): UpstreamGraph => {
  const { reds, edges, components, windowMinutes } = input;

  // edges + caller name map
  const cleanEdges: CallerEdge[] = [];
  const callerName = new Map<string, string>();
  const aiByCaller = new Map<string, Set<string>>();
  const serviceName = new Map<string, string>();
  for (const e of edges) {
    if (!e.upstreamId || !e.aiServiceId) continue;
    cleanEdges.push({ upstreamId: e.upstreamId, aiServiceId: e.aiServiceId });
    if (e.upstream) callerName.set(e.upstreamId, e.upstream);
    if (e.aiService) serviceName.set(e.aiServiceId, e.aiService);
    if (!aiByCaller.has(e.upstreamId)) aiByCaller.set(e.upstreamId, new Set());
    aiByCaller.get(e.upstreamId)!.add(e.aiServiceId);
  }

  // callers = union of RED rows and edge sources
  const callerIds = new Set<string>([
    ...reds.map((r) => r.svcId).filter((s): s is string => !!s),
    ...cleanEdges.map((e) => e.upstreamId),
  ]);
  const redById = new Map(reds.filter((r) => r.svcId).map((r) => [r.svcId!, r]));
  const mins = windowMinutes > 0 ? windowMinutes : 1;
  const callers: UpstreamCaller[] = [...callerIds].map((id) => {
    const r = redById.get(id);
    const requests = n(r?.requests);
    const errors = n(r?.errors);
    return {
      id,
      name: r?.svc || callerName.get(id) || id,
      requests,
      errPct: requests > 0 ? (errors / requests) * 100 : 0,
      p90Ms: n(r?.p90ns) / 1_000_000,
      p95Ms: n(r?.p95ns) / 1_000_000,
      throughputPerMin: requests / mins,
      aiServiceIds: [...(aiByCaller.get(id) ?? [])],
    };
  });

  // services = dedup by id, enriched with components
  const compById = new Map(components.filter((c) => c.svcId).map((c) => [c.svcId!, c]));
  const serviceIds = new Set<string>(cleanEdges.map((e) => e.aiServiceId));
  const services: AiServiceNode[] = [...serviceIds].map((id) => {
    const c = compById.get(id);
    return {
      id, name: serviceName.get(id) || id,
      agents: clean(c?.agents), tools: clean(c?.tools), models: clean(c?.models),
    };
  });

  return { callers, services, edges: cleanEdges };
};

export const topCallersByVolume = (callers: UpstreamCaller[], count: number): Set<string> =>
  new Set([...callers].sort((a, b) => b.requests - a.requests).slice(0, count).map((c) => c.id));

export const sortCallers = (
  callers: UpstreamCaller[], key: SortKey, dir: "asc" | "desc",
): UpstreamCaller[] => {
  const mul = dir === "asc" ? 1 : -1;
  const val = (c: UpstreamCaller): number | string =>
    key === "name" ? c.name.toLowerCase()
    : key === "aiServices" ? c.aiServiceIds.length
    : (c[key] as number);
  return [...callers].sort((a, b) => {
    const av = val(a), bv = val(b);
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mul;
    return (av - bv) * mul;
  });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run ui/app/pages/Pulse/archMap/upstreamGraph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/pages/Pulse/archMap/upstreamGraph.ts ui/app/pages/Pulse/archMap/upstreamGraph.test.ts
git commit -m "feat(pulse): upstream graph assembly + sort/top-N helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Smartscape entity URL builder

**Files:**
- Create: `ui/app/pages/Pulse/archMap/smartscapeUrl.ts`
- Test: `ui/app/pages/Pulse/archMap/smartscapeUrl.test.ts`

**Interfaces:**
- Produces: `smartscapeEntityUrl(entityId: string, origin?: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// ui/app/pages/Pulse/archMap/smartscapeUrl.test.ts
import { describe, it, expect } from "vitest";
import { smartscapeEntityUrl } from "./smartscapeUrl";

describe("smartscapeEntityUrl", () => {
  it("builds a services-app deep link containing the entity id", () => {
    const u = smartscapeEntityUrl("SERVICE-ABC", "https://ualpre.apps.dynatrace.com");
    expect(u).toContain("https://ualpre.apps.dynatrace.com");
    expect(u).toContain("SERVICE-ABC");
  });
  it("returns empty string for a blank id", () => {
    expect(smartscapeEntityUrl("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run ui/app/pages/Pulse/archMap/smartscapeUrl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `smartscapeUrl.ts`**

```ts
// ui/app/pages/Pulse/archMap/smartscapeUrl.ts
/**
 * Deep-link to a service entity's detail page. Route pattern isolated here so
 * call sites never hardcode it. NOTE: verify the exact classic-services route
 * against the running platform during implementation (Task 10) and adjust the
 * PATH constant only — the signature/tests stay stable.
 */
const PATH = "/ui/apps/dynatrace.classic.services/ui/entity/";

export const smartscapeEntityUrl = (
  entityId: string,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): string => (entityId ? `${origin}${PATH}${entityId}` : "");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run ui/app/pages/Pulse/archMap/smartscapeUrl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/pages/Pulse/archMap/smartscapeUrl.ts ui/app/pages/Pulse/archMap/smartscapeUrl.test.ts
git commit -m "feat(pulse): smartscape entity URL builder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `useUpstreamDetail` hook

**Files:**
- Create: `ui/app/pages/Pulse/archMap/useUpstreamDetail.ts`

**Interfaces:**
- Consumes: `buildAiServiceIdsQuery` (`../../Agents/queries`), `buildUpstreamRedQuery` (`./clientUpstreamQueries`), `buildUpstreamEdgePairsQuery`/`buildUpstreamP90SeriesQuery`/`buildServiceComponentsQuery` (`./upstreamDetailQueries`), `assembleUpstreamGraph` (`./upstreamGraph`), `useScope`, `useGlobalFilters`, `useResolvedServices`/`canQueryScope`, `useScopedDql`, `useDql`, `useScanGroup`/`useScanScope` (for limitHit), `timeframeMinutes` helper (compute from scope; if none exists, inline `(to-from)/60000`).
- Produces: `useUpstreamDetail(enabled: boolean): { graph: UpstreamGraph; p90Series: Map<string, (number|null)[]>; labels: string[]; isLoading: boolean; error?: Error; limitHit: boolean }`

- [ ] **Step 1: Implement the hook**

Mirror `useClientUpstream.ts` structure (same 4-query chain), but: gate every query on `enabled`, swap `buildClientUpstreamQuery`→`buildUpstreamEdgePairsQuery` (edge pairs), swap the throughput series→`buildUpstreamP90SeriesQuery`, add `buildServiceComponentsQuery`, and assemble via `assembleUpstreamGraph`. Compute `windowMinutes` from `scope.timeframe`. Return the P90 series as a `Map<svcId, (number|null)[]>` plus the timeseries `labels` for the chart x-axis. Set `error = firstError of the queries`; `limitHit = useScanGroup(useScanScope())?.limitHit ?? false`.

```ts
// ui/app/pages/Pulse/archMap/useUpstreamDetail.ts   (skeleton — fill from useClientUpstream)
import { useMemo } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import { useGlobalFilters } from "../../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../../scope/useResolvedServices";
import { useScanGroup, useScanScope } from "../../../scope/ScanReportContext";
import { buildAiServiceIdsQuery } from "../../Agents/queries";
import { buildUpstreamRedQuery } from "./clientUpstreamQueries";
import {
  buildUpstreamEdgePairsQuery, buildUpstreamP90SeriesQuery, buildServiceComponentsQuery,
} from "./upstreamDetailQueries";
import { assembleUpstreamGraph, type UpstreamGraph } from "./upstreamGraph";

export interface UpstreamDetail {
  graph: UpstreamGraph;
  p90Series: Map<string, (number | null)[]>;
  labels: string[];
  isLoading: boolean;
  error?: Error;
  limitHit: boolean;
}

export const useUpstreamDetail = (enabled: boolean): UpstreamDetail => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const canQuery = enabled && canQueryScope(resolution);
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;

  // 1: AI service ids  (useScopedDql, enabled: canQuery)
  // 2: edge pairs      (useDql buildUpstreamEdgePairsQuery(aiIds), enabled: aiIds.length>0)
  // 3: RED per caller  (useDql buildUpstreamRedQuery(callerIds, tf))
  // 4: P90 series      (useDql buildUpstreamP90SeriesQuery(callerIds, tf))
  // 5: components      (useDql buildServiceComponentsQuery(aiIds, tf))
  //   callerIds come from the edge-pairs' distinct upstreamId.
  //   labels: derive from the timeseries record's timeframe/interval like usePulseSeries;
  //           if the SDK returns a `timeframe`+`interval`, build "Xm ago" labels, else [].

  // return assembleUpstreamGraph({ reds, edges, components, windowMinutes }) + series map.
  return useMemo<UpstreamDetail>(() => { /* … */ }, [/* query data deps */]);
};
```

Fill the body following `useClientUpstream.ts` verbatim for query wiring (same `record`-extraction pattern). `windowMinutes = Math.max(1, (Date.parse(scope.timeframe.to ?? nowIso) - Date.parse(fromIso)) / 60000)` — reuse any existing `timeframeMinutes`/interval helper from `usePulseSeries.ts` if present (grep first); otherwise inline. For P90 series labels, reuse the interval/labels derivation already used by `usePulseSeries.ts` (import it if exported).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add ui/app/pages/Pulse/archMap/useUpstreamDetail.ts
git commit -m "feat(pulse): useUpstreamDetail hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `UpstreamGoldenSignalsTable`

**Files:**
- Create: `ui/app/pages/Pulse/archMap/UpstreamGoldenSignalsTable.tsx`

**Interfaces:**
- Consumes: `UpstreamCaller`, `SortKey`, `sortCallers` (`./upstreamGraph`); `smartscapeEntityUrl` (`./smartscapeUrl`); `errorRateStatus` (`../../Explorer/serviceStatus`); `statusColor`, `STATUS_CUE` (`../../../theme/statusColor`); `fmtCount`, `fmtMs`, `fmtPercent` (`../../../data/format`).
- Produces: `UpstreamGoldenSignalsTable({ callers, selectedId, onSelect })` where `onSelect(id: string | null): void`.

- [ ] **Step 1: Implement the table**

Copy the CSS-grid table structure from `ui/app/pages/Explorer/AIServicesTable.tsx` (the `GRID_TEMPLATE` + `overflow-x:auto` + `min-width` pattern, `HeaderCell`/`Cell`, local sort state). Columns (grid tracks): status `28px`, service `minmax(200px,2fr)`, requests `96px`, err% `84px`, p90 `88px`, p95 `88px`, throughput `108px`, → AI services `120px`, ↗ `40px`. Cells use `fmtCount(requests)`, `fmtPercent(errPct)`, `fmtMs(p90Ms)`, `fmtMs(p95Ms)`, `fmtCount(throughputPerMin)` + `"/min"`, `caller.aiServiceIds.length` (title = names, if you thread names — else just the count). Status glyph via `errorRateStatus(errPct)` → `statusColor` + `STATUS_CUE` (identical to `AIServicesTable`'s `RowStatus`). Row `onClick` calls `onSelect(caller.id === selectedId ? null : caller.id)` (toggle). Selected row gets a left-accent + tint (`background: color-mix(in oklab, var(--blue) 6%, transparent)`). The `↗` cell is an `<a href={smartscapeEntityUrl(caller.id)} target="_blank" rel="noreferrer">` (stopPropagation on click so it doesn't also toggle the row). Sort: reuse `sortCallers(callers, key, dir)`; header buttons with `aria-sort`, mirroring `AIServicesTable`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add ui/app/pages/Pulse/archMap/UpstreamGoldenSignalsTable.tsx
git commit -m "feat(pulse): upstream golden-signals table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `UpstreamP90Chart`

**Files:**
- Create: `ui/app/pages/Pulse/archMap/UpstreamP90Chart.tsx`

**Interfaces:**
- Consumes: `UpstreamCaller` (`./upstreamGraph`); `topCallersByVolume` (`./upstreamGraph`); `AreaChart` (`../../../components/charts/AreaChart`); `CATEGORICAL` palette (`../../../theme/palette`); `fmtMs` (`../../../data/format`).
- Produces: `UpstreamP90Chart({ callers, p90Series, labels, selectedId, onSelect })`.

- [ ] **Step 1: Implement the chart**

Local state `showAll: boolean` (default false). Compute the visible set: `showAll ? all : topCallersByVolume(callers, 8)`, but ALWAYS include `selectedId`. Build `AreaChart` `series[]`: one entry per visible caller — `{ label: caller.name, values: p90Series.get(caller.id)?.map(v=>v==null?null:v/1_000_000) ?? [], color, axis: "left" }`, color from `CATEGORICAL[i % CATEGORICAL.length]`. Emphasis: when `selectedId` is set, the selected caller's series keeps full color/opacity and others render faded (pass a dimmed color, e.g. `color-mix(in oklab, <c> 25%, transparent)`) — implement by choosing the color per series based on `selectedId`. Non-visible callers (beyond top-8, not selected) collapse into a single faint "Others (N)" context line = element-wise mean of their series (compute in a small pure helper; no test required but keep it a named function). `formatLeft={fmtMs}` and hover uses `fmtMs`. Header: a right-aligned "Show all N" / "Show top 8" toggle button. Clicking a series is out of scope; selection is driven by the table.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add ui/app/pages/Pulse/archMap/UpstreamP90Chart.tsx
git commit -m "feat(pulse): upstream P90-over-time chart (top-8 + show-all)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `UpstreamFlowMap`

**Files:**
- Create: `ui/app/pages/Pulse/archMap/UpstreamFlowMap.tsx`

**Interfaces:**
- Consumes: `UpstreamGraph`, `UpstreamCaller`, `AiServiceNode` (`./upstreamGraph`); `statusColor`/`errorRateStatus` for caller node tone; `FrameworkChips` (`./FrameworkChips`) for the component chips if its props fit, else a local chip; `fmtCount`/`fmtMs`. 
- Produces: `UpstreamFlowMap({ graph, selectedId, onSelect })`.

- [ ] **Step 1: Implement the flow map**

Fresh standalone 3-column CSS layout (NOT the existing map): `display:grid; gridTemplateColumns: "minmax(180px,1fr) minmax(160px,1fr) minmax(240px,1.6fr)"; gap:24`. Column 1 = caller nodes (name + `fmtCount(requests)` + err tone dot via `errorRateStatus`/`statusColor`), each a button calling `onSelect(id===selectedId?null:id)`. Column 2 = AI-service nodes (`graph.services`). Column 3 = per-service component groups: for each service, a small card with model/agent/tool chips (reuse `FrameworkChips` or a local chip styled from `mapCss` tokens), capped with "+N". Edges: render as inline connectors — simplest legible approach that avoids SVG routing: when NOTHING is selected, show all nodes at full opacity with light connector lines drawn via an absolutely-positioned SVG overlay (compute node anchor points from refs) OR, to avoid ref math in v1, **draw column-to-column relationships by co-highlighting**: hovering/selecting a caller applies `data-active` and dims non-reachable nodes. **Spotlight (the core interaction):** when `selectedId` is set, compute `reachableServiceIds = new Set(caller.aiServiceIds)`; callers other than selected → opacity 0.25; services not in `reachableServiceIds` → opacity 0.25; component groups of non-reachable services → opacity 0.25. When `selectedId` is null, everything is full opacity (global view). Include the honesty caption below the grid: `"Topology view — what each caller can reach (Smartscape + gen_ai), not per-request attribution."` 

  v1 connector lines: use a single absolutely-positioned SVG layer sized to the grid; measure the three columns' node vertical centers with a `ResizeObserver` + refs keyed by node id; draw a `<path>` per edge (caller-center → service-center) and per service→its-component-card. If ref-based routing proves fiddly, ship v1 WITHOUT drawn lines (co-highlight only) and note it — the spotlight dim/lighten already communicates the paths. (Reviewer note: lines are a nice-to-have; the dim/spotlight is the requirement.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add ui/app/pages/Pulse/archMap/UpstreamFlowMap.tsx
git commit -m "feat(pulse): upstream 3-column service-flow map with caller spotlight

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `UpstreamServicesModal` shell

**Files:**
- Create: `ui/app/pages/Pulse/archMap/UpstreamServicesModal.tsx`

**Interfaces:**
- Consumes: `useUpstreamDetail` (`./useUpstreamDetail`); `UpstreamGoldenSignalsTable`, `UpstreamP90Chart`, `UpstreamFlowMap`; `useModalA11y` (`../../../components/useModalA11y` — grep for exact path); `EmptyState`+`emptyCause` and `ErrorState`; `smartscapeEntityUrl`.
- Produces: `UpstreamServicesModal({ open, onClose })`.

- [ ] **Step 1: Implement the shell**

Render nothing when `!open`. Otherwise a fixed full-screen scrim + centered dialog (`~92vw × 90vh`, `role="dialog" aria-modal`), wired with `useModalA11y(ref, onClose)` (focus trap/restore/Esc), mirroring an existing modal (e.g. `Explorer/ServiceModelModal.tsx` or `charts/ChartExpander.tsx`). State `const [selectedId, setSelectedId] = useState<string|null>(null)`. Call `const d = useUpstreamDetail(open)`. Header: `Upstream services · {d.graph.callers.length} callers` + close button. Body (vertical stack, each section a card): 
  1. loading → `PanelSkeleton`; `d.error` → `<ErrorState bare error={d.error} />`; else if `d.graph.callers.length===0` → `<EmptyState bare cause={emptyCause({ error: d.error, limitHit: d.limitHit })} title="No upstream callers in scope" />`.
  2. `<UpstreamGoldenSignalsTable callers={d.graph.callers} selectedId={selectedId} onSelect={setSelectedId} />`
  3. `<UpstreamP90Chart callers={d.graph.callers} p90Series={d.p90Series} labels={d.labels} selectedId={selectedId} onSelect={setSelectedId} />`
  4. `<UpstreamFlowMap graph={d.graph} selectedId={selectedId} onSelect={setSelectedId} />`

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add ui/app/pages/Pulse/archMap/UpstreamServicesModal.tsx
git commit -m "feat(pulse): upstream services modal shell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Wire the Client node to open the modal

**Files:**
- Modify: `ui/app/pages/Pulse/ArchitectureMap.tsx` (import; the `<NodeDrawer>` block at 408-431)

**Interfaces:**
- Consumes: `UpstreamServicesModal` (`./archMap/UpstreamServicesModal`); existing `picked`/`setPicked` state.

- [ ] **Step 1: Add the import**

```ts
import { UpstreamServicesModal } from "./archMap/UpstreamServicesModal";
```

- [ ] **Step 2: Suppress the drawer for the Client tier and render the modal**

Change the `<NodeDrawer meta={picked} ...>` so the drawer never opens for the client node, then render the modal:

```tsx
      <NodeDrawer
        meta={picked && picked.key !== "client" ? picked : null}
        view={picked && picked.key !== "client" ? data.nodes[picked.key] : null}
        tierSeries={ /* unchanged, but guard the same way: */
          picked && picked.key !== "client"
            ? { /* …existing object… */ }
            : null
        }
        clientUpstream={null}
        onClose={() => setPicked(null)}
        onDrill={(path, focus) => goToTab(path, { focus: focus as FocusParam })}
      />
      <UpstreamServicesModal
        open={picked?.key === "client"}
        onClose={() => setPicked(null)}
      />
      <DetailModal detail={detail} onClose={() => setDetail(null)} onDrill={onDrill} />
```

(Keep the existing `tierSeries` object contents; only add the `picked.key !== "client"` guard around it. `data.clientUpstream` is now unused by the drawer — leave `useClientUpstream`/`data.clientUpstream` in place; it still powers the Client node's headline chips.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add ui/app/pages/Pulse/ArchitectureMap.tsx
git commit -m "feat(pulse): open upstream-services modal from the Client node

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Verify, deploy, visually confirm

**Files:** none (verification + deploy)

- [ ] **Step 1: Full verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, all tests pass (previous count + new query/graph/url tests), build "Done."

- [ ] **Step 2: Confirm the Smartscape route**

Open the running app; click a caller's `↗`. If the route 404s, adjust only `PATH` in `smartscapeUrl.ts` to the correct classic-services entity route, re-run `npx vitest run …/smartscapeUrl.test.ts`, and re-verify.

- [ ] **Step 3: Deploy to ualpre**

Bump `app.config.json` `app.version`; set `environmentUrl` → `https://ualpre.apps.dynatrace.com/`; `npm run deploy`; confirm "App is deployed"; revert `environmentUrl` to `https://your-tenant.apps.dynatrace.com/`.

- [ ] **Step 4: Visual check**

On Pulse, click the Client (top) node → modal opens. Confirm: table lists all callers with p90/p95/throughput/→AI-services and working `↗`; P90 chart shows top-8 with Show-all; selecting a table row bolds it in the chart and spotlights its path in the flow map; flow shows callers→AI services→components; honesty caption present. (The app renders in a cross-origin iframe that blocks programmatic scroll — if a screenshot can't be driven, ask the user to confirm.)

- [ ] **Step 5: Commit any route fix + final state**

```bash
git add -A
git commit -m "chore(pulse): confirm smartscape route + deploy upstream-services modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** entry/shell (T8/T9) ✓ · golden-signals table incl. p95/throughput/→AI/Smartscape, no cost (T1/T2/T5) ✓ · P90 top-8 + show-all (T6) ✓ · fresh 3-column flow with spotlight + honesty caption (T7) ✓ · Smartscape links (T3/T5) ✓ · data layer queries+hook (T1/T4) ✓ · topology fidelity/no per-caller cost (constraints + T7 caption) ✓ · component boundaries (one file each) ✓ · testing of pure units (T1/T2/T3) ✓ · non-goals respected (no trace attribution, no cost, fleet map untouched) ✓.

**Placeholder scan:** Component tasks (T5-T8) intentionally reference exact existing components to mirror (`AIServicesTable`, `AreaChart`, `ServiceModelModal`, `useModalA11y`) rather than rest{ate} their full source — paths and the non-obvious logic (grid tracks, spotlight rule, series emphasis, four-state body) are given concretely. The P90-series `labels` derivation and `useModalA11y` path are flagged as "grep for exact"; acceptable since both are existing utilities the implementer will locate. `smartscapeUrl` PATH is explicitly a verify-in-T10 constant, isolated behind a stable signature.

**Type consistency:** `UpstreamCaller`/`AiServiceNode`/`CallerEdge`/`UpstreamGraph`/`SortKey` defined once in T2 and consumed unchanged in T4-T8; `useUpstreamDetail` returns `{ graph, p90Series, labels, isLoading, error, limitHit }` consumed verbatim in T8; query builder names match between T1 and T4.

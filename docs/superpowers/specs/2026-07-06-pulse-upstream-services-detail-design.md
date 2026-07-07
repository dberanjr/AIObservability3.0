# Pulse — Upstream Services Detail Modal + Service Flow

**Date:** 2026-07-06 · **Status:** approved design (pre-plan) · **Branch:** redesign-5-tab

## Goal

Replace the thin drawer that opens from the Pulse architecture-map **Client (top) node**
with a rich, near-full-screen modal that (1) surfaces detailed golden signals for **all**
detected upstream caller services, (2) charts their P90 latency over the selected timeframe,
(3) deep-links each to Smartscape, and (4) visualizes the **service flow** from callers →
AI services → the frameworks / agents / tools / LLMs each reaches.

Only the **Client tier's** node opens this modal. Every other tier keeps its current
`NodeDrawer` unchanged.

## Fidelity constraint (load-bearing)

Distributed traces do **not** connect a caller to the specific gen_ai spans it drives:
in a 2h ualpre sample, of 1,799 traces containing AI spans only **46 (2.6%)** span more than
one service (avg 1.03 services/AI-trace, max 3), because `parent.service.name` isn't emitted.

Therefore the flow is assembled at **topology fidelity**, from two solid sources:
- **caller → AI service**: Smartscape `calls` edges (note: `source_id`/`target_id` are
  `smartscape_id`-typed — filters must use `toString()`; see the smartscape-id lesson).
- **AI service → components**: `gen_ai.*` span aggregation per `dt.entity.service`.

The UI states this plainly (caption on the flow map): *"Topology view — what each caller can
reach, not per-request attribution."* We do **not** claim per-request or per-caller-precise
downstream attribution. There is **no per-caller cost column** (attribution would double-count
shared services like `bos-proxy-core`); cost stays on the AI-service surfaces.

## Entry & shell

- Clicking the **Client node** opens `UpstreamServicesModal` — a near-full-screen dialog
  (~92vw × 90vh) built on the existing full-screen modal shell + `useModalA11y`
  (focus trap / restore / Esc), matching the app's other modals.
- **Header:** `Upstream services · {N} callers` · active timeframe (read-only, from scope) ·
  a global **Open in Smartscape** link.
- Shared selection state `selectedCallerId: string | null` is lifted to the modal and passed
  to all three sections; selecting a caller anywhere spotlights it everywhere.

## Section 1 — Golden-signals table

Sortable table over all callers, using the **CSS-grid table pattern** established in
`AIServicesTable` (single `grid-template-columns` for header + rows; `minmax` on the name
column; `overflow-x:auto` + `min-width`) so columns align and names never crush.

Columns:

| Status | Service | Requests | Err % | P90 | P95 | Throughput | → AI services | ↗ |
|---|---|---|---|---|---|---|---|---|

- Data = each caller's **own** RED metrics from `buildUpstreamRedQuery`, extended to also emit
  `p95ns = percentile(duration, 95)` (it currently returns requests, errors, p90 only).
  Throughput (req/min) is derived client-side from requests ÷ timeframe minutes. All from the
  caller's own spans.
- **Status** glyph via the shared `errorRateStatus` + `statusColor` + `STATUS_CUE` (non-color
  cue), consistent with the AI-services table.
- **→ AI services** = count of AI services this caller calls; tooltip lists their names.
- **↗** deep-links this caller's entity in Smartscape.
- **Row = selector:** clicking a row sets `selectedCallerId` → emphasizes it in the P90 chart
  and spotlights it in the flow map. The table doubles as the chart legend.
- No cost column (see fidelity note).

## Section 2 — P90-over-time chart

- Multi-line chart, **one line per caller**, y = P90 latency (`fmtMs`), x = selected timeframe.
- New query `buildUpstreamP90SeriesQuery`: `makeTimeseries p90 = percentile(duration, 90),
  by: { svcId = dt.entity.service }` filtered to the caller entity ids.
- **Legibility:** default to the **top 8 callers by request volume** as distinct lines; the
  remaining callers collapse into a single faint "others" context band. The caller selected in
  the table renders **bold**; the rest fade. A **"Show all"** toggle expands to all callers.
- Reuses `AreaChart` (left axis only) with a per-caller color from the categorical palette;
  hover readout uses `fmtMs` (per the chart-tooltip-units convention).

## Section 3 — Layered service-flow map (centerpiece)

Three tier-columns, left → right, reusing arch-map node/edge styling (`MapNode`,
`FrameworkChips`, tier tokens, `statusColor`):

```
CALLERS               AI SERVICES              COMPONENTS (grouped per AI service)
RED-scored nodes  ─►  gen_ai services     ─►   framework · agents · tools · models
```

- **Edges:** caller→AI-service from the (fixed) Smartscape caller query, returned as
  **source/target pairs** (not just counts) so edges can be drawn; AI-service→components from
  the per-service gen_ai rollup.
- **Caller filter / spotlight:** setting `selectedCallerId` (table row **or** clicking a caller
  node) lights that caller's edges + reachable nodes and dims everything else. Clicking a lit
  caller again clears the filter (back to the full global map).
- **Nodes are drillable:** AI-service node → Explorer/Smartscape detail; model node → Models
  page; framework/agent/tool → their existing detail affordance where one exists.
- **Honesty caption** beneath the map (fidelity note).
- Density: 19 callers is comfortable in a column. The components tier groups by AI service and
  reuses the existing chip/summary treatment (framework badge + agent count + tool/model chips,
  capped with "+N") rather than exploding every leaf.

## Data layer

New query module `pages/Pulse/archMap/upstreamDetailQueries.ts` (or extend
`clientUpstreamQueries.ts`), all scope/timeframe aware except the global Smartscape steps:

- **Reuse (+extend):** `buildUpstreamRedQuery` (per-caller RED) — add `p95ns`; the fixed
  `buildUpstreamSmartscapeQuery` / `buildClientUpstreamQuery` (caller→service).
- **New — caller→service edge pairs:** like the smartscape caller query but emitting
  `{ upstreamId, upstream, aiServiceId, aiService }` rows (drop the `summarize` to counts), for
  drawing edges and computing "→ AI services".
- **New — `buildUpstreamP90SeriesQuery`:** per-caller P90 timeseries.
- **New — `buildServiceComponentsQuery`:** per AI service, `collectDistinct` of framework,
  agent names (`gen_ai.agent.name`), tool names (`gen_ai.tool.name`), and model labels
  (`gen_ai.request.model`) from gen_ai spans grouped by `dt.entity.service`.

**Hook `useUpstreamDetail`** orchestrates: resolve AI-service entity ids → Smartscape caller
edges → RED + P90 series for those callers → per-service component rollup. Returns
`{ callers[], edges[], services[] (with components), isLoading, error }`. Surfaces `error`
and `limitHit` per the STATE-2/STATE-4 conventions.

## Component boundaries (each independently testable)

- `UpstreamServicesModal` — shell: header, layout, owns `selectedCallerId`, wires `useUpstreamDetail`.
- `UpstreamGoldenSignalsTable` — pure presentation of `callers[]` + sort + row-select callback.
- `UpstreamP90Chart` — `series[]` + selection → emphasized multi-line + show-all toggle.
- `UpstreamFlowMap` — `{callers, edges, services}` + selection → tiered node-link + spotlight.
- Pure helpers (unit-tested): top-N-by-volume selection, caller→service→component **graph
  assembly**, sort comparators, and a **Smartscape entity URL builder**.

## Smartscape links

A small `smartscapeEntityUrl(entityId)` helper builds the platform deep-link to a service
entity's detail/Smartscape view. Exact route pattern to be confirmed against the running
platform during implementation (Services classic app vs. entity deep-link); the builder
isolates that so call sites don't hardcode it.

## Testing

- Unit tests for the pure helpers (top-N selection, graph assembly, sort comparators,
  Smartscape URL builder).
- Query-builder tests only where the existing suite already does so (keep minimal, match style).
- Typecheck + full vitest + build green before deploy (standing workflow).

## Non-goals

- Per-request / per-trace attribution of downstream components (data not present).
- Per-caller cost.
- Editing topology or real-time streaming.
- Changing any tier other than Client, or the fleet-wide arch map itself.

## Reuse summary

Fixed smartscape caller query, `buildUpstreamRedQuery`, `AreaChart`, the CSS-grid table pattern,
`MapNode`/`FrameworkChips`/tier tokens, `statusColor`/`STATUS_CUE`/`errorRateStatus`,
`useModalA11y`, `fmtMs`/`fmtCount`/`fmtPercent`. New surface is the modal + its three sections +
the per-service component rollup query + the P90 series query.

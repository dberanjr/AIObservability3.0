# Design: Tweak cleanup, app-wide scan pills, span-bucket filter, AI-bucket detection, Field Notes tab, UX report

**Date:** 2026-07-05
**Branch:** redesign-5-tab
**Status:** Approved 2026-07-05

## Approval notes
- Bucket filter targets `fetch spans` only (not `fetch logs`) — confirmed.
- Empty-bucket guard is documentation-only (no pre-flight validation) —
  confirmed.
- Detect-AI-buckets results list reports **only buckets that contain AI
  spans** — inherent to the query (filter-by-matcher then
  `summarize by: {dt.system.bucket}` yields count > 0 rows only; buckets with
  zero AI spans never appear).

## Goal

Six related changes to the AI Observability app, driven by one theme: reduce
DQL scan cost and rule out UI tweaks that hide visuals.

1. Remove the `density` and `tileStyle` tweaks entirely (they strip
   backgrounds/shadows/borders and are suspected of hiding rendered visuals).
2. Put the Summary page's per-tile scan-stats pill **and** the "inherited
   query" note on every DQL-executing tile, on every page.
3. Add a new "Span-bucket filter" tweak: a toggle + comma-separated bucket
   field that injects an `OR`-of-buckets partition filter into every DQL query
   to prune scan cost. The field's value persists while hidden.
4. Add a "Detect AI buckets" button to the Attributes page that lists which
   Grail buckets hold AI spans (with counts) in the current timeframe, and
   lets the user scope the page to one bucket.
5. Add a "Field Notes" tab that renders a static reference HTML document.
6. Produce an expert UX / data-design improvement report across all pages,
   for the user to triage before any of it is implemented.

## Key facts established (code + live tenant)

- **One injection point.** Every query routes through `useScopedDql`
  (`ui/app/scope/useScopedDql.ts`). It rewrites the DQL string in a fixed
  order — sampling → scan-limit → global-filter (direct per-span) →
  trace-scope — then attaches active Segments as the **request parameter**
  `filterSegments` (NOT DQL text) before calling `useDql`.
- **Buckets and segments are orthogonal.** Buckets live in DQL text; segments
  live on the request param. They AND together. Coexistence is the real path.
- **Bucket pruning is real (measured on ualpre).** `fetch spans` over 1h
  truncated at the 500 GB scan limit; adding
  `| filter dt.system.bucket == "bos_spans"` dropped it to 4.74 GB and
  completed. `dt.system.bucket` is a Grail partition key; filtering on it
  pushes down to partition selection. Preferred multi-bucket form:
  `in(dt.system.bucket, {"a", "b"})` (curly-brace grouping; a non-existent
  bucket name is a harmless no-op).
- **Only `bos_spans`** currently carries AI spans on ualpre (not
  `genai_spans`) — hardcoding bucket names is wrong; detection is the answer.
- **Scan telemetry is already emitted for every query** (`useScopedDql` lines
  154-181 report each query's scanned bytes / ms / limit-hit to
  `ScanReportContext`, gated by the `showScanDebug` tweak). Only the
  **rendering** (`TileScanFooter` + owned/inherited attribution in
  `pages/Summary/tileScan.ts`) is Summary-only today.
- **`tileStyle` ≠ `TileGlyphs`.** `TileGlyphs.tsx` (mini-donut SVGs) reads no
  tweak and stays. Only the `density` and `tileStyle` **tweaks** are removed.
- **The likely visual-hiding culprit:** `SummaryTilesRow.tsx` `TileShell`
  applies `{background:"transparent", boxShadow:"none", border:"none"}` when
  `density === "minimal"` — and `minimal` is the current default.

## Resolved decisions

- **Scan pill/note:** render on every tile on every page, **gated behind the
  existing `showScanDebug` tweak** (app-wide diagnostic mode; no new default
  visual noise).
- **Bucket + segment:** both apply (intersection). When both are active, show
  a small informational chip in the header. No override.
- **UX report:** deliver a prioritized report; user picks; then implement only
  the picked items.
- **Fixed tile look:** bake in the full "card" look (comfortable padding,
  surfaces with background/shadow/border). Removes the stripping that hides
  visuals.

---

## Deliverable 1 — Remove `density` + `tileStyle` tweaks

### Changes
- `ui/app/tweaks/TweaksContext.tsx`: remove `Density` and `TileStyle` types,
  the `density`/`tileStyle` fields on `TweaksState`, their `DEFAULT_TWEAKS`
  entries, the `setDensity`/`setTileStyle` context signatures + `merge`
  wiring, and the `data-aiobs-density` / `data-aiobs-tile` writes in the
  mirror `useEffect`. (Persisted blobs keep stale keys harmlessly; the
  `{...DEFAULT_TWEAKS, ...persisted}` read path just stops reading them —
  matches the `traceMatchCap` DORMANT precedent, no migration.)
- `ui/app/tweaks/TweaksPanel.tsx`: remove the `Density`/`TileStyle` imports,
  the `DENSITY_OPTIONS` / `TILE_OPTIONS` consts, and the two panel rows.
- `ui/app/theme/tokens.ts`: remove the density CSS-var block, the
  `[data-aiobs-density=...]` overrides, the `[data-aiobs-tile=...]` rules, and
  the now-unneeded "Summary immunity" counter-rules. Bake the "card" values
  (comfortable padding, `--shadow` present, borders/background present) into
  the base `:root` tokens so tiles render the full card look unconditionally.
- `ui/app/pages/Pulse/SummaryTilesRow.tsx` `TileShell`: drop the
  `useTweaks()` density/tileStyle read and the `tileOverride`/`pad` branching;
  use fixed `pad = 12` and no surface override (keep the card).
- Grep-sweep any remaining `data-aiobs-density` / `data-aiobs-tile` /
  `t.density` / `t.tileStyle` references (className markers like
  `aiobs-tile-item` / `aiobs-summary-page` are unrelated names — keep them,
  but verify they don't depend on removed CSS).

### Tests
- Update tweak tests to assert `density`/`tileStyle` are absent from
  `DEFAULT_TWEAKS` and the panel renders without those rows.
- A persisted blob containing legacy `density`/`tileStyle` keys still loads
  without error (backfill/merge test).

---

## Deliverable 2 — Scan pill + inherited-note on every tile, every page

### Approach
Introduce one shared wrapper and generalize the attribution so any page can
opt a tile in with a single component, keyed behind `showScanDebug`.

- **New component** `ui/app/scope/ScanScopedTile.tsx`: renders
  `<ScanScope name={id}>{children}<TileScanFooter group={id} title={title}/></ScanScope>`.
  `TileScanFooter` moves out of `pages/Summary/` into a shared location and
  takes an explicit `title` prop (falls back to the scope name) so it no
  longer depends on the Summary-only `GROUP_TITLES` table.
- **Generalize `tileScan.ts`.** Replace the hardcoded Summary
  `GROUP_TITLES` / `GROUP_PRIORITY` with:
  - title: passed in per tile (or derived from scope name);
  - owned-vs-inherited: a query is "owned" by the first-mounted tile that ran
    it; any later tile running the identical executed-query text shows the
    inherited note pointing at the owner's title. This drops the global
    priority table in favor of first-registration ownership, which works
    across pages without a central registry. Unify the two `aggregate()`
    implementations (ScanReportContext + tileScan) into one.
- **Adopt per page.** Wrap each page's tile component in `ScanScopedTile`
  with a unique, namespaced scope id (`"<page>:<tile>"`) to avoid collisions
  in the shared `ScanReportProvider` map:
  Pulse (`SummaryTilesRow`), Models (`ModelsTilesRow`), Explorer
  (`ExplorerTiles`), Prompts (`PromptsTilesRow`), Agents (`AgentsTilesRow`),
  Attributes (`SectionCard`), plus any standalone chart cards that run a
  `useScopedDql`. Summary already uses the pattern and just adopts the shared
  component.
- `PageScanTotal` already renders on every page via `ResolutionStatusLine`;
  no change.

### Risk / notes
- `TileScanFooter` styling (dashed top border, micro font) must render
  acceptably in denser tiles (e.g. Models fixed-height KPI tiles). Give it a
  compact variant.
- `CollapsibleTile` unmounts collapsed tiles (removing their scan entries);
  the page-total already reflects only mounted tiles — acceptable and
  consistent.

### Tests
- Generalized `computeTileReport`: owned/inherited split by first-registration
  across arbitrary scope ids; page-total == sum of owned bytes invariant
  holds with the unified `aggregate()`.

---

## Deliverable 3 — "Span-bucket filter" tweak

### State (`TweaksContext.tsx`, in `PageConfig`)
- `bucketFilterEnabled: boolean` (default `false`)
- `bucketFilterText: string` (default `""`) — raw comma-separated buckets,
  stored verbatim, split on read. Preserved when the toggle is off ("persists
  while hidden" is automatic — the whole blob is always written).
- Setters `setBucketFilterEnabled` / `setBucketFilterText` via `mergePage`.
- Helper `parseBuckets(text): string[]` — split on comma, trim, drop empties,
  dedupe.

### Panel (`TweaksPanel.tsx`, "Page configuration" section)
- A toggle row (ON/OFF Segmented, mirroring `showScanDebug`).
- When ON, a text input row for the comma-separated bucket names. Use a
  Strato text input if one is available in the design system, else a styled
  `<input>`. The input stays rendered-but-hidden logic is unnecessary — hide
  the row when OFF; the value persists in state regardless.
- Short helper text: "Restricts every span query to these Grail buckets
  (OR), pruning scan cost. Use Attributes → Detect AI buckets to find them."

### Injection (`ui/app/scope/queries.ts` + `useScopedDql.ts`)
- New `injectBucketFilter(query, buckets: string[]): string` in `queries.ts`,
  cloning the `injectTraceScope` fetch-line regex, emitting
  `| filter in(dt.system.bucket, {"a", "b"})` after each `fetch spans`
  statement. (Spans only — matches "span buckets". `fetch logs` is left
  alone.) No-op when `buckets` is empty.
- In `useScopedDql` `queryInput` memo, after `injectScanLimit` and before the
  global-filter block: `if (bucketOn && !ignoreBucketFilter) rewritten =
  injectBucketFilter(rewritten, buckets)`. Read `bucketFilterEnabled` /
  parsed buckets from `useTweaks()`; add to memo deps.
- New opt-out `UseScopedDqlExtra.ignoreBucketFilter?: boolean`.
- **Empty-bucket guard:** if the tweak is ON but every listed bucket matches
  nothing, all pages silently zero out. Mitigation: the header chip (below)
  and the Attributes detector guide the user to valid buckets; document the
  behavior. (No pre-flight validation — that would itself cost a scan.)

### Segment coexistence + header chip
- Buckets inject into DQL text; segments stay on `filterSegments`. Both apply.
- `ui/app/components/Header.tsx` (or `ResolutionStatusLine`): when
  `bucketFilterEnabled && buckets.length` AND `segments.length`, render a
  small informational chip: "Buckets + segment both active". Purely
  informational; nothing is overridden.

### Tests
- `injectBucketFilter`: single/multi bucket, empty list no-op, multiple
  `fetch spans` in one query (joins), leaves `fetch logs` untouched, idempotent
  ordering with scan-limit + global-filter.
- `parseBuckets`: trims, dedupes, drops empties.

---

## Deliverable 4 — Attributes: "Detect AI buckets" button

### Matcher constant
New shared constant `GENAI_BUCKET_MATCHER` (the exact OpenPipeline genai_spans
storage rule — verified valid on ualpre):
```
isNotNull(`gen_ai.system`) or isNotNull(`gen_ai.provider.name`)
or isNotNull(`gen_ai.operation.name`) or isNotNull(`gen_ai.request.model`)
or isNotNull(`gen_ai.agent.name`) or isNotNull(`gen_ai.tool.name`)
or isNotNull(`traceloop.span.kind`) or isNotNull(`traceloop.workflow.name`)
or isNotNull(`llm.request.type`) or isNotNull(`gen_ai.prompt.0.role`)
or isNotNull(`gen_ai.completion.0.role`) or isNotNull(`openinference.span.kind`)
```
Distinct from the existing narrower `AI_SPAN_POPULATION`. Backtick-quote the
dotted/numeric field names.

### Detection query + hook
- New `useBucketDetection()` hook. Builds:
  ```
  fetch spans, samplingRatio: 1, from: <tf.from>, to: <tf.to>, scanLimitGBytes: 500
  | filter <GENAI_BUCKET_MATCHER>
  | summarize spans = count(), by: {dt.system.bucket}
  | sort spans desc
  ```
  Run through `useScopedDql` with **`ignoreBucketFilter: true`** and a new
  **`ignoreSegments: true`** opt-out, so it is immune to the bucket tweak and
  segments but still honors timeframe, scan-limit, and sampling. Sampling
  **honors the toolbar ratio** (no override) per the "honor sampling"
  requirement; if a low ratio risks missing sparse buckets, that is surfaced
  by the same scan-limit/partial-result warning as any other query.
- **`ignoreSegments`** is new surface: add a guard in `useScopedDql` so this
  flag returns the plain rewritten string even when segments exist (today
  `ignoreGlobalFilter` does NOT skip segments).
- Lazy: only fires when the user clicks "Detect AI buckets" (`enabled` gated
  on a trigger).

### UI (`AttributeAuditPage.tsx`)
- A "Detect AI buckets" button near the page header.
- Results: a simple list of `{bucket, spans}` rows, sorted desc, each
  selectable. Show a warning if the detection query hit its scan limit
  (`readScanMeta().limitHit`) — results may be partial.
- Selecting a bucket sets `selectedBucket` (page state). "Clear" resets it.

### Scope the page to a bucket
- Thread `selectedBucket` into `useAttributeAudit` → `buildSectionQuery`,
  appending `| filter dt.system.bucket == "<selected>"` right after the
  `fetch spans` line (page-local, independent of the global tweak). All 10
  section coverage queries then reflect only that bucket. Selected-bucket
  state is surfaced in the page header ("Scoped to bucket: X").

### Tests
- `buildSectionQuery` with a `selectedBucket` appends exactly one bucket
  filter after fetch; without it, unchanged.
- Detection query builder shape + opt-out flags set.

---

## Deliverable 5 — "Field Notes" tab

### Approach: vendor + same-origin iframe
- Copy `ai-observability-dynatrace-customer-brief_v8.html` (876 KB, base64
  fonts inline) into `ui/assets/field-notes.html` (served same-origin at
  `/ui/assets/field-notes.html`). Vendoring keeps a single in-repo source and
  avoids coupling the build to a machine-specific absolute path.
- New page `ui/app/pages/FieldNotes/FieldNotesPage.tsx` renders a flex-fill
  container with `<iframe src="assets/field-notes.html" title="AI
  Observability Field Notes" style={{ width:"100%", height:"100%",
  minHeight:"80vh", border:0 }} />` (the container stretches to fill
  `Page.Main`; `minHeight` guarantees usable height if the flex chain
  collapses).
- `App.tsx`: add `<Route path="/field-notes" element={<FieldNotesPage/>} />`.
- `Header.tsx`: add `{ to:"/field-notes", label:"Field Notes" }` to
  `NAV_ITEMS`, positioned last (next to About).
- Strip the external Google-Fonts `@import` from the vendored copy to avoid a
  CSP console error (the inline base64 DTFlow font remains; Spline Sans Mono
  degrades to a system mono fallback). Keep the copy otherwise verbatim.

### Risk
- **Must verify** in a running dev build that the platform CSP permits framing
  a same-origin `/ui/assets/*.html` document (cross-app iframes are blocked;
  same-origin asset framing is expected to work). If blocked, fall back to
  reading the file as a raw string at build time and rendering a sanitized
  body fragment (larger bundle; last resort).

---

## Deliverable 6 — UX / data-design improvement report

- Run a read-only analysis workflow: one analyst per page (Summary, Pulse,
  Explorer, Agents, Prompts, Models/FinOps, Attributes) plus cross-cutting
  analysts (information hierarchy, dataviz/color per the `dataviz` skill,
  empty/loading/error states, accessibility). Each returns prioritized,
  concrete suggestions with rationale and effort.
- Synthesize into `docs/ux-improvement-report-2026-07-05.md` and a companion
  visual Artifact for skim-reading.
- **Gate:** present the report; the user picks which suggestions to implement;
  only picked items are built (in a follow-up phase).

---

## Sequencing (implementation phases, each a workflow)

1. **Tweak removal** (D1) — smallest, unblocks the "card" baseline.
2. **Bucket tweak + opt-outs + header chip** (D3) — pipeline plumbing +
   opt-out flags that D4 also needs.
3. **AI-bucket detection** (D4) — depends on the `ignoreBucketFilter` /
   `ignoreSegments` opt-outs from D3.
4. **Scan pills everywhere** (D2) — broad but mechanical; independent.
5. **Field Notes tab** (D5) — independent; verify CSP.
6. **UX report** (D6) — read-only; can run in parallel from the start; gated.

Every DQL change is validated on ualpre via MCP `execute-dql` before ship, and
the app is redeployed to ualpre after the build (standing preference). Follow
TDD for the pure logic (injectors, parsers, attribution) per the repo's test
culture.

## Out of scope
- Removing other tweaks (theme/accent/chart/colorblind/pageConfig) — keep.
- Removing `TileGlyphs.tsx` — it is not the `tileStyle` tweak.
- Implementing UX suggestions beyond the user's picks.
- Collapsing to a single hardcoded bucket — detection drives bucket choice.

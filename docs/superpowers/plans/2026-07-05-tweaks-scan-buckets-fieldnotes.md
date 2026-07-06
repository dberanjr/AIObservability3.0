# Tweak cleanup, app-wide scan pills, span-bucket filter, AI-bucket detection, Field Notes tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed via the Workflow tool (one workflow per phase), each agent doing the TDD cycle below on the real files.

**Goal:** Remove the `density`/`tileStyle` tweaks; add an app-wide span-bucket scan-pruning tweak; add AI-bucket detection to the Attributes page; render the scan pill + inherited-note on every tile app-wide; add a Field Notes documentation tab.

**Architecture:** Every DQL query already flows through `useScopedDql` (single injection point) and every query already reports scan telemetry to `ScanReportContext`. We add one more injector (`injectBucketFilter`, spans-only) and two opt-out flags (`ignoreBucketFilter`, `ignoreSegments`), generalize the Summary-only scan-footer into a shared `ScanScopedTile`, and add two new tweak fields. Buckets live in DQL text; segments live on the `filterSegments` request param — they coexist.

**Tech Stack:** React + TypeScript, Dynatrace Strato components, `@dynatrace-sdk/react-hooks` `useDql`, Vitest, dt-app CLI (Vite/esbuild).

## Global Constraints

- Test runner: **Vitest**. Run one file: `npx vitest run <path/to/file.test.ts>`. Tests are co-located `*.test.ts`, `import { describe, expect, it } from "vitest"`.
- Typecheck: `npm run typecheck` (must pass). Lint: `npm run lint` (warnings allowed, errors not).
- Build: `npm run build`. Deploy to ualpre after a green build (standing preference): set the env URL, `npm run deploy`, revert placeholder.
- **Every new/changed DQL query is validated on ualpre via MCP `execute-dql` before it ships.**
- Bucket filter targets `fetch spans` **only** (never `fetch logs`).
- Multi-bucket DQL form: `| filter in(dt.system.bucket, {"a", "b"})` (curly-brace grouping).
- AI-span matcher = the exact 12-condition OpenPipeline `genai_spans` rule (Task B-verified valid). Backtick-quote dotted/numeric field names.
- Tweak persistence is one blob (`ai-obs.tweaks`); adding/removing `PageConfig` fields needs no migration (the `{...DEFAULT_TWEAKS.pageConfig, ...persisted}` merge backfills). New tweak defaults must be OFF/empty (no behavior change for existing users).
- Do NOT remove `TileGlyphs.tsx` — it is unrelated to the `tileStyle` tweak.
- Commit after each task with a `feat:`/`refactor:`/`test:` message + the Co-Authored-By trailer.

---

## Phase A — Remove `density` + `tileStyle` tweaks (D1)

Bake in the full "card" look. Order: strip consumers first so nothing reads a removed field, then remove the tweak definition.

### Task A1: Fix the base tile look in `tokens.ts` (bake in "card")

**Files:**
- Modify: `ui/app/theme/tokens.ts` — density CSS-var block (~102-109), `[data-aiobs-density=…]` overrides (~192-215), `[data-aiobs-tile=…]` rules (~217-238), Summary-immunity counter-rules (~240-265).

**Steps:**
- [ ] **Step 1:** Read `ui/app/theme/tokens.ts` fully. Identify the `density` CSS-var defaults block and set the base `:root` tokens to the **comfortable** values (`--d-row`, `--d-tile-pad-y`, `--d-gap`, and `--shadow` present).
- [ ] **Step 2:** Delete the `[data-aiobs-density="compact"]`, `[data-aiobs-density="minimal"]`, `[data-aiobs-tile="bordered"]`, `[data-aiobs-tile="ghost"]` rule blocks entirely.
- [ ] **Step 3:** Delete the now-unnecessary "Summary immunity" counter-rules that re-asserted the card look against those overrides (they become the default).
- [ ] **Step 4:** `npm run typecheck` and `npm run build` — expect success (CSS is a template string; verify no unbalanced braces).
- [ ] **Step 5:** Commit: `refactor(tweaks): bake card surface into base tokens; drop density/tile CSS overrides`.

### Task A2: Remove density/tileStyle from `SummaryTilesRow` TileShell

**Files:**
- Modify: `ui/app/pages/Pulse/SummaryTilesRow.tsx` — `TileShell` (~360-373).

**Steps:**
- [ ] **Step 1:** In `TileShell`, remove `const { density, tileStyle } = useTweaks();` and the `pad`/`tileOverride` branching. Replace with `const pad = 12;` and drop `tileOverride` (spread nothing, or `{}`), so the tile keeps its card surface. Remove the now-unused `useTweaks` import if nothing else in the file uses it (grep first).
- [ ] **Step 2:** `npm run typecheck` — expect success.
- [ ] **Step 3:** Commit: `refactor(pulse): TileShell uses fixed card padding, no density/tileStyle`.

### Task A3: Remove the tweak definition + panel rows + tests

**Files:**
- Modify: `ui/app/tweaks/TweaksContext.tsx` — remove `Density` (line 12) & `TileStyle` (line 13) types; `density`/`tileStyle` on `TweaksState` (110-111); `DEFAULT_TWEAKS` entries (125-126); `setDensity`/`setTileStyle` on `TweaksContextValue` (147-148); `merge("density")`/`merge("tileStyle")` wiring (232-233); the `root.setAttribute("data-aiobs-density"/"data-aiobs-tile", …)` lines in the mirror `useEffect` (186-187).
- Modify: `ui/app/tweaks/TweaksPanel.tsx` — remove `Density`/`TileStyle` from the type import (line 11/13); `DENSITY_OPTIONS` (241-245) & `TILE_OPTIONS` (246-250); the two panel rows (density ~412-420, tile ~422-430).
- Test: `ui/app/tweaks/TweaksContext.test.ts` (create if absent, else extend).

**Steps:**
- [ ] **Step 1: Write the failing test** — `ui/app/tweaks/TweaksContext.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_TWEAKS } from "./TweaksContext";

describe("DEFAULT_TWEAKS after density/tileStyle removal", () => {
  it("no longer defines density or tileStyle", () => {
    expect("density" in DEFAULT_TWEAKS).toBe(false);
    expect("tileStyle" in DEFAULT_TWEAKS).toBe(false);
  });
  it("still defines the retained visual tweaks", () => {
    expect(DEFAULT_TWEAKS.theme).toBeDefined();
    expect(DEFAULT_TWEAKS.accent).toBeDefined();
    expect(DEFAULT_TWEAKS.pageConfig).toBeDefined();
  });
});
```
- [ ] **Step 2:** `npx vitest run ui/app/tweaks/TweaksContext.test.ts` — expect FAIL (density still present).
- [ ] **Step 3:** Make the removals listed in **Files** above.
- [ ] **Step 4:** `npx vitest run ui/app/tweaks/TweaksContext.test.ts` — expect PASS.
- [ ] **Step 5:** `grep -rn "density\|tileStyle\|data-aiobs-density\|data-aiobs-tile" ui/app` — confirm zero remaining references to the tweaks (className markers `aiobs-tile-item`/`aiobs-summary-page` are unrelated names and may remain; `chart density` comment in `usePulseSummary.ts` is unrelated). `npm run typecheck` + `npm run lint`.
- [ ] **Step 6:** Commit: `feat(tweaks): remove density and tileStyle tweaks entirely`.

---

## Phase B — Span-bucket filter tweak + opt-outs + header chip (D3)

### Task B0: Validate the bucket-filter DQL on ualpre (no code)

- [ ] **Step 1:** Via MCP `execute-dql`, confirm `fetch spans, from:-1h | filter in(dt.system.bucket, {"bos_spans"}) | summarize count()` scans far less than the unfiltered form and completes (already measured: 500 GB → 4.74 GB). Record the numbers in the task notes. This gates the whole phase.

### Task B1: `parseBuckets` helper (pure, TDD)

**Files:**
- Modify: `ui/app/scope/queries.ts` (add export).
- Test: `ui/app/scope/bucketFilter.test.ts`.

**Interfaces — Produces:** `parseBuckets(text: string): string[]`

**Steps:**
- [ ] **Step 1: Write failing test** — `ui/app/scope/bucketFilter.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseBuckets } from "./queries";

describe("parseBuckets", () => {
  it("splits on commas, trims, drops empties, dedupes", () => {
    expect(parseBuckets(" bos_spans , genai_spans ,, bos_spans ")).toEqual([
      "bos_spans",
      "genai_spans",
    ]);
  });
  it("returns [] for empty / whitespace", () => {
    expect(parseBuckets("")).toEqual([]);
    expect(parseBuckets("   ")).toEqual([]);
  });
});
```
- [ ] **Step 2:** `npx vitest run ui/app/scope/bucketFilter.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** in `queries.ts`:
```ts
/** Parse a comma-separated bucket list into a clean, deduped array. */
export const parseBuckets = (text: string): string[] => {
  const seen = new Set<string>();
  for (const raw of (text ?? "").split(",")) {
    const b = raw.trim();
    if (b) seen.add(b);
  }
  return [...seen];
};
```
- [ ] **Step 4:** `npx vitest run ui/app/scope/bucketFilter.test.ts` — expect PASS.
- [ ] **Step 5:** Commit: `feat(scope): add parseBuckets helper`.

### Task B2: `injectBucketFilter` injector (pure, TDD)

**Files:**
- Modify: `ui/app/scope/queries.ts`.
- Test: `ui/app/scope/bucketFilter.test.ts` (extend).

**Interfaces — Consumes:** `parseBuckets`. **Produces:** `injectBucketFilter(query: string, buckets: string[]): string`

**Steps:**
- [ ] **Step 1: Add failing tests** to `bucketFilter.test.ts`:
```ts
import { injectBucketFilter } from "./queries";

describe("injectBucketFilter", () => {
  it("appends an OR-of-buckets filter after each fetch spans", () => {
    const out = injectBucketFilter("fetch spans, from:-1h\n| summarize count()", [
      "bos_spans",
      "genai_spans",
    ]);
    expect(out).toBe(
      'fetch spans, from:-1h\n| filter in(dt.system.bucket, {"bos_spans", "genai_spans"})\n| summarize count()',
    );
  });
  it("is a no-op for an empty bucket list", () => {
    const q = "fetch spans, from:-1h | summarize count()";
    expect(injectBucketFilter(q, [])).toBe(q);
  });
  it("never touches fetch logs", () => {
    const q = "fetch logs, from:-1h\n| summarize count()";
    expect(injectBucketFilter(q, ["bos_spans"])).toBe(q);
  });
  it("injects into every fetch spans in a join", () => {
    const q = "fetch spans\n| join [\nfetch spans\n], on:{}";
    const out = injectBucketFilter(q, ["bos_spans"]);
    expect(out.match(/dt\.system\.bucket/g)?.length).toBe(2);
  });
});
```
- [ ] **Step 2:** `npx vitest run ui/app/scope/bucketFilter.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** in `queries.ts` (spans-only regex, mirrors `injectTraceScope`; dedupe/escape via existing helpers):
```ts
/**
 * Insert an OR-of-buckets partition filter after EVERY `fetch spans` statement
 * (spans only — never logs). `dt.system.bucket` is a Grail partition key, so
 * this prunes the scan to the named buckets. No-op when `buckets` is empty,
 * leaving the query (and its query key) stable.
 */
export const injectBucketFilter = (
  query: string,
  buckets: string[],
): string => {
  if (!query || !buckets || buckets.length === 0) return query;
  const list = buckets.map((b) => `"${dqlEscape(b)}"`).join(", ");
  const pipe = `| filter in(dt.system.bucket, {${list}})`;
  return query.replace(/^([ \t]*fetch\s+spans\b[^\n]*)$/gm, `$1\n${pipe}`);
};
```
- [ ] **Step 4:** `npx vitest run ui/app/scope/bucketFilter.test.ts` — expect PASS.
- [ ] **Step 5:** Commit: `feat(scope): add injectBucketFilter (spans-only bucket pruning)`.

### Task B3: New tweak fields + setters

**Files:**
- Modify: `ui/app/tweaks/TweaksContext.tsx` — `PageConfig` (add fields), `DEFAULT_TWEAKS.pageConfig`, `TweaksContextValue` (setters), `mergePage` wiring.
- Test: `ui/app/tweaks/TweaksContext.test.ts` (extend).

**Interfaces — Produces:** `pageConfig.bucketFilterEnabled: boolean`, `pageConfig.bucketFilterText: string`, `setBucketFilterEnabled(v: boolean)`, `setBucketFilterText(v: string)`.

**Steps:**
- [ ] **Step 1: Add failing test:**
```ts
it("defaults the bucket filter off and empty", () => {
  expect(DEFAULT_TWEAKS.pageConfig.bucketFilterEnabled).toBe(false);
  expect(DEFAULT_TWEAKS.pageConfig.bucketFilterText).toBe("");
});
```
- [ ] **Step 2:** `npx vitest run ui/app/tweaks/TweaksContext.test.ts` — expect FAIL.
- [ ] **Step 3: Implement:** add to `PageConfig` interface: `bucketFilterEnabled: boolean;` and `bucketFilterText: string;`. Add to `DEFAULT_TWEAKS.pageConfig`: `bucketFilterEnabled: false, bucketFilterText: "",`. Add to `TweaksContextValue`: `setBucketFilterEnabled: (v: boolean) => void; setBucketFilterText: (v: string) => void;`. Wire in the value memo: `setBucketFilterEnabled: mergePage("bucketFilterEnabled"), setBucketFilterText: mergePage("bucketFilterText"),`.
- [ ] **Step 4:** `npx vitest run ui/app/tweaks/TweaksContext.test.ts` — expect PASS. `npm run typecheck`.
- [ ] **Step 5:** Commit: `feat(tweaks): add span-bucket filter state (enabled + text)`.

### Task B4: Panel controls (toggle + text field)

**Files:**
- Modify: `ui/app/tweaks/TweaksPanel.tsx` — "Page configuration" section (~491-564), following the `showScanDebug` ON/OFF row pattern.

**Steps:**
- [ ] **Step 1:** Add an ON/OFF `Segmented` row "Span-bucket filter" bound to `t.pageConfig.bucketFilterEnabled` / `t.setBucketFilterEnabled` (map the `"on"|"off"` value like the existing `showScanDebug` row does).
- [ ] **Step 2:** When `bucketFilterEnabled`, render a text input row bound to `t.pageConfig.bucketFilterText` / `t.setBucketFilterText` (use a Strato text input if the design system exports one; else a styled `<input type="text">` matching panel styling). Placeholder: `bos_spans, genai_spans`. Helper text: `Restricts every span query to these Grail buckets (OR) to prune scan cost. Use Attributes → Detect AI buckets to find them.`
- [ ] **Step 3:** `npm run typecheck` + `npm run lint`. Manually confirm the value persists when toggled off (state blob is written whole).
- [ ] **Step 4:** Commit: `feat(tweaks): span-bucket filter panel controls`.

### Task B5: Wire opt-out flags + bucket injection into `useScopedDql`

**Files:**
- Modify: `ui/app/scope/useScopedDql.ts` — `UseScopedDqlExtra` (51-69), the `queryInput` memo (103-140), the segment-attach branch (124-130).
- Test: none direct (covered by B2 + the detection query validation in Phase C); rely on typecheck + manual.

**Interfaces — Produces:** `UseScopedDqlExtra.ignoreBucketFilter?: boolean`, `UseScopedDqlExtra.ignoreSegments?: boolean`.

**Steps:**
- [ ] **Step 1:** Add `ignoreBucketFilter?: boolean;` and `ignoreSegments?: boolean;` (with doc comments) to `UseScopedDqlExtra`.
- [ ] **Step 2:** In the hook body, read the tweak: `const { bucketFilterEnabled, bucketFilterText } = useTweaks().pageConfig;` and `const buckets = useMemo(() => parseBuckets(bucketFilterText), [bucketFilterText]);`. Import `parseBuckets` and `injectBucketFilter` from `./queries`.
- [ ] **Step 3:** In the `queryInput` memo, after `const scanned = injectScanLimit(sampled, scanLimitGb);` and `let rewritten = scanned;`, insert before the global-filter block:
```ts
if (bucketFilterEnabled && !options?.ignoreBucketFilter && buckets.length) {
  rewritten = injectBucketFilter(rewritten, buckets);
}
```
- [ ] **Step 4:** In the segment-attach branch, gate on the new flag so the detection query is segment-immune:
```ts
if (options?.ignoreSegments || !segments || segments.length === 0) return rewritten;
```
- [ ] **Step 5:** Add `bucketFilterEnabled`, `buckets`, `options?.ignoreBucketFilter`, `options?.ignoreSegments` to the memo dependency array.
- [ ] **Step 6:** `npm run typecheck`. Commit: `feat(scope): inject bucket filter in useScopedDql; add ignoreBucketFilter/ignoreSegments opt-outs`.

### Task B6: Header "buckets + segment both active" chip

**Files:**
- Modify: `ui/app/layout/ResolutionStatusLine.tsx` (render near the existing segment hint) OR `ui/app/components/Header.tsx`.

**Steps:**
- [ ] **Step 1:** Read `ResolutionStatusLine.tsx`. Compute `const bucketOn = t.pageConfig.bucketFilterEnabled && parseBuckets(t.pageConfig.bucketFilterText).length > 0;` and `const segmentOn = segments.length > 0;` (via `useSegments`).
- [ ] **Step 2:** When `bucketOn && segmentOn`, render a small informational chip: `Buckets + segment both active` with a tooltip `Your bucket filter and the active segment both apply (intersection).` Style it as a subtle info chip (not an error).
- [ ] **Step 3:** `npm run typecheck` + `npm run lint`. Commit: `feat(header): informational chip when bucket filter + segment are both active`.

---

## Phase C — Attributes: "Detect AI buckets" (D4)

Depends on Phase B (opt-out flags).

### Task C1: `GENAI_BUCKET_MATCHER` constant + validate on ualpre

**Files:**
- Create: `ui/app/detection/genaiBucketMatcher.ts`.
- Test: `ui/app/detection/genaiBucketMatcher.test.ts`.

**Interfaces — Produces:** `GENAI_BUCKET_MATCHER: string` (the 12-condition OR predicate).

**Steps:**
- [ ] **Step 1: Write failing test** asserting the constant contains all 12 attribute names and OR-joins them:
```ts
import { describe, expect, it } from "vitest";
import { GENAI_BUCKET_MATCHER } from "./genaiBucketMatcher";
const ATTRS = [
  "gen_ai.system","gen_ai.provider.name","gen_ai.operation.name",
  "gen_ai.request.model","gen_ai.agent.name","gen_ai.tool.name",
  "traceloop.span.kind","traceloop.workflow.name","llm.request.type",
  "gen_ai.prompt.0.role","gen_ai.completion.0.role","openinference.span.kind",
];
describe("GENAI_BUCKET_MATCHER", () => {
  it("references all 12 genai_spans attributes", () => {
    for (const a of ATTRS) expect(GENAI_BUCKET_MATCHER).toContain("`" + a + "`");
  });
  it("OR-joins them and uses isNotNull", () => {
    expect(GENAI_BUCKET_MATCHER).toContain("isNotNull");
    expect((GENAI_BUCKET_MATCHER.match(/ or /g) ?? []).length).toBe(11);
  });
});
```
- [ ] **Step 2:** `npx vitest run ui/app/detection/genaiBucketMatcher.test.ts` — expect FAIL.
- [ ] **Step 3: Implement:**
```ts
/**
 * The exact OpenPipeline `genai_spans` storage-rule matcher: a span is an AI
 * span if any of these attributes is present. Backtick-quoted for the dotted /
 * numeric field names. Validated on ualpre.
 */
export const GENAI_BUCKET_MATCHER = [
  "gen_ai.system","gen_ai.provider.name","gen_ai.operation.name",
  "gen_ai.request.model","gen_ai.agent.name","gen_ai.tool.name",
  "traceloop.span.kind","traceloop.workflow.name","llm.request.type",
  "gen_ai.prompt.0.role","gen_ai.completion.0.role","openinference.span.kind",
].map((a) => "isNotNull(`" + a + "`)").join(" or ");
```
- [ ] **Step 4:** `npx vitest run ui/app/detection/genaiBucketMatcher.test.ts` — expect PASS.
- [ ] **Step 5:** Validate the full detection query on ualpre via MCP `execute-dql` (already done during design — re-confirm it returns `{dt.system.bucket, spans}` rows). Commit: `feat(detection): genai_spans bucket matcher constant`.

### Task C2: `buildBucketDetectionQuery` + `useBucketDetection` hook

**Files:**
- Create: `ui/app/pages/AttributeAudit/bucketDetection.ts` (query builder, pure) + test.
- Create: `ui/app/pages/AttributeAudit/useBucketDetection.ts` (hook).

**Interfaces — Consumes:** `GENAI_BUCKET_MATCHER`, `dqlTimeArg`, `useScopedDql`. **Produces:** `buildBucketDetectionQuery(tf): string`; `useBucketDetection(): { run(): void; buckets: {bucket:string; spans:number}[]; isLoading; limitHit; hasRun }`.

**Steps:**
- [ ] **Step 1: Write failing test** for the builder — `bucketDetection.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildBucketDetectionQuery } from "./bucketDetection";
describe("buildBucketDetectionQuery", () => {
  it("filters by the matcher then summarizes by bucket", () => {
    const q = buildBucketDetectionQuery({ from: "-6h", to: "now()" });
    expect(q).toContain("fetch spans");
    expect(q).toContain("isNotNull(`gen_ai.request.model`)");
    expect(q).toContain("summarize spans = count(), by: {dt.system.bucket}");
    expect(q).toContain("sort spans desc");
  });
});
```
- [ ] **Step 2:** `npx vitest run ui/app/pages/AttributeAudit/bucketDetection.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `bucketDetection.ts`:
```ts
import { dqlTimeArg } from "../../scope/queries";
import { GENAI_BUCKET_MATCHER } from "../../detection/genaiBucketMatcher";
import type { Timeframe } from "../../scope/types";

export const buildBucketDetectionQuery = (tf: Timeframe): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(tf.from)}, to: ${dqlTimeArg(tf.to ?? "now()")}, scanLimitGBytes: 500
| filter ${GENAI_BUCKET_MATCHER}
| summarize spans = count(), by: {dt.system.bucket}
| sort spans desc
`.trim();
```
- [ ] **Step 4:** `npx vitest run …/bucketDetection.test.ts` — expect PASS.
- [ ] **Step 5: Implement the hook** `useBucketDetection.ts`: a `useState` trigger (`hasRun`), `useScopedDql(buildBucketDetectionQuery(scope.timeframe), { enabled: hasRun, ignoreBucketFilter: true, ignoreSegments: true, staleTime: 60_000 })`. Map `data.records` → `{bucket: string, spans: number}[]` (via `toNum`). Expose `limitHit` from `readScanMeta(result, scanLimitGb)` (or reuse the result's grail metadata). `run()` sets `hasRun` true. (Sampling/scan-limit honored automatically — the query keeps `samplingRatio: 1` in the builder but `useScopedDql` rewrites it to the toolbar ratio.)
- [ ] **Step 6:** `npm run typecheck`. Commit: `feat(attributes): bucket-detection query builder + hook`.

### Task C3: Thread `selectedBucket` into the section queries

**Files:**
- Modify: `ui/app/pages/AttributeAudit/queries.ts` — `buildSectionQuery` gains an optional `bucket?: string` param.
- Modify: `ui/app/pages/AttributeAudit/useAttributeAudit.ts` — accept + pass through `selectedBucket`.
- Test: `ui/app/pages/AttributeAudit/queries.test.ts` (create).

**Interfaces — Produces:** `buildSectionQuery(section, timeframe, bucket?: string): string`; `useAttributeAudit(selectedBucket?: string | null)`.

**Steps:**
- [ ] **Step 1: Write failing test** — `queries.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildSectionQuery } from "./queries";
import { SECTIONS } from "./catalog";
const tf = { from: "-24h", to: "now()" };
describe("buildSectionQuery bucket scoping", () => {
  it("appends a bucket filter after fetch when a bucket is given", () => {
    const q = buildSectionQuery(SECTIONS[0], tf, "bos_spans");
    expect(q).toContain('| filter dt.system.bucket == "bos_spans"');
  });
  it("adds no bucket filter when none is given", () => {
    expect(buildSectionQuery(SECTIONS[0], tf)).not.toContain("dt.system.bucket");
  });
});
```
- [ ] **Step 2:** `npx vitest run …/AttributeAudit/queries.test.ts` — expect FAIL.
- [ ] **Step 3: Implement:** add `bucket?: string` to `buildSectionQuery`; when present, insert `| filter dt.system.bucket == "${dqlEscape(bucket)}"` immediately after the `fetch spans …` line (before the population filter). Import `dqlEscape`. In `useAttributeAudit`, add a `selectedBucket?: string | null` param and pass it into `buildSectionQuery(section, scope.timeframe, selectedBucket ?? undefined)`.
- [ ] **Step 4:** `npx vitest run …/AttributeAudit/queries.test.ts` — expect PASS. `npm run typecheck`.
- [ ] **Step 5:** Commit: `feat(attributes): scope section coverage queries to a selected bucket`.

### Task C4: Attributes page UI — button, results list, bucket scoping

**Files:**
- Modify: `ui/app/pages/AttributeAudit/AttributeAuditPage.tsx`.

**Steps:**
- [ ] **Step 1:** Add page state `const [selectedBucket, setSelectedBucket] = useState<string | null>(null);` and pass it into `useAttributeAudit(selectedBucket)`.
- [ ] **Step 2:** Wire `useBucketDetection()`. Add a "Detect AI buckets" button near the page header that calls `detection.run()`.
- [ ] **Step 3:** Render the results as a simple selectable list of `{bucket, spans}` rows (sorted desc), each showing the bucket name + formatted span count (`fmtInt`/`toNum`). Clicking a row calls `setSelectedBucket(bucket)`. Show a "Clear bucket" affordance when `selectedBucket` is set, and a header line `Scoped to bucket: <name>`. If `detection.limitHit`, show a small warning "Detection hit the scan limit — some buckets may be missing (raise the scan limit or narrow the timeframe)."
- [ ] **Step 4:** `npm run typecheck` + `npm run lint`. Commit: `feat(attributes): Detect AI buckets button, results list, and bucket page scoping`.

---

## Phase D — Scan pill + inherited-note on every tile (D2)

### Task D1: Generalize `computeTileReport` + move `tileScan`/`TileScanFooter` to shared scope

**Files:**
- Move/Modify: `ui/app/pages/Summary/tileScan.ts` → `ui/app/scope/tileScan.ts` (generalize).
- Move/Modify: `ui/app/pages/Summary/TileScanFooter.tsx` → `ui/app/scope/TileScanFooter.tsx` (add `title` prop).
- Modify: importers `ui/app/pages/Summary/SummaryCard.tsx`, `ui/app/pages/Summary/PostureBand.tsx`, `ui/app/pages/Summary/SummaryPage.tsx`.
- Test: `ui/app/scope/tileScan.test.ts` (move + extend the existing `tileScan.test.ts`).

**Interfaces — Produces:**
`computeTileReport(entries, group, opts?: { titleOf?: (g: string) => string; orderOf?: (g: string) => number }): TileScanReport` — default `titleOf` is identity, default `orderOf` is a deterministic string sort (so ownership is stable app-wide without a priority table). Summary passes its `GROUP_TITLES`/`priority` in to preserve current behavior.
`TileScanFooter({ group, title }: { group: string | null; title?: string })`.

**Steps:**
- [ ] **Step 1:** Move `tileScan.ts` to `ui/app/scope/`, unify its `aggregate()` with `ScanReportContext`'s (import the exported one; delete the duplicate). Change `computeTileReport` signature to accept `opts` and replace the hardcoded `GROUP_TITLES`/`priority` internals with `opts.titleOf ?? ((g) => g)` and `opts.orderOf ?? ((g) => …stable string order…)`.
- [ ] **Step 2:** Move the existing `tileScan.test.ts` to `ui/app/scope/`; keep the Summary-priority test by passing Summary's tables via `opts`; ADD a generic test: two groups sharing a query, no `opts` → the deterministic owner is credited and the other lists it as inherited; page-total == sum of owned bytes.
- [ ] **Step 3:** `npx vitest run ui/app/scope/tileScan.test.ts` — expect PASS.
- [ ] **Step 4:** Move `TileScanFooter.tsx` to `ui/app/scope/`, add optional `title` prop, and have it call `computeTileReport(entries, group, { titleOf, orderOf })` where the title of the OWN group is `title`. Keep the Summary tables available: Summary importers pass `titleOf={(g)=>GROUP_TITLES[g]??g}`. (Simplest generalization: keep `GROUP_TITLES` in the Summary caller and pass a resolver; other pages pass their own tile title.)
- [ ] **Step 5:** Update the three Summary importers to the new paths. `npm run typecheck` + `npx vitest run ui/app/scope/tileScan.test.ts`.
- [ ] **Step 6:** Commit: `refactor(scope): move + generalize tileScan/TileScanFooter for app-wide use`.

### Task D2: `ScanScopedTile` wrapper

**Files:**
- Create: `ui/app/scope/ScanScopedTile.tsx`.
- Test: none (thin composition); covered by typecheck + adoption.

**Interfaces — Consumes:** `ScanScope`, `TileScanFooter`. **Produces:** `ScanScopedTile({ name, title, children })` → `<ScanScope name>{children}<TileScanFooter group={name} title={title}/></ScanScope>`.

**Steps:**
- [ ] **Step 1: Implement:**
```tsx
import React from "react";
import { ScanScope } from "./ScanReportContext";
import { TileScanFooter } from "./TileScanFooter";

/**
 * Wrap a tile so it (a) tags its DQL scans with a unique group id and (b)
 * renders the per-tile scan pill + inherited-note (both Tweaks-gated). Use a
 * namespaced `name` like "models:cost-per-call" to avoid cross-page collisions.
 */
export const ScanScopedTile = ({
  name,
  title,
  children,
}: {
  name: string;
  title?: string;
  children: React.ReactNode;
}) => (
  <ScanScope name={name}>
    {children}
    <TileScanFooter group={name} title={title} />
  </ScanScope>
);
```
- [ ] **Step 2:** `npm run typecheck`. Commit: `feat(scope): ScanScopedTile wrapper (scan pill + inherit note per tile)`.

### Task D3..DN: Adopt `ScanScopedTile` per page

For each page below, wrap its tile component's render in `ScanScopedTile` with a **unique namespaced** `name` (`"<page>:<tile>"`) and a human `title`. One task per page (independently testable via typecheck + a running-app visual check with the scan-debug tweak on).

- [ ] **Task D3 — Pulse** (`SummaryTilesRow.tsx` tiles): wrap each tile; names `pulse:<id>`.
- [ ] **Task D4 — Models/FinOps** (`ModelsTilesRow` + chart cards): names `models:<id>`. Verify the footer's dashed border + micro font render acceptably in the fixed-height KPI tiles; if cramped, pass a compact style.
- [ ] **Task D5 — Explorer** (`ExplorerTiles`): names `explorer:<id>`.
- [ ] **Task D6 — Prompts** (`PromptsTilesRow` + quality/pattern cards): names `prompts:<id>`.
- [ ] **Task D7 — Agents** (`AgentsTilesRow` + tables): names `agents:<id>`.
- [ ] **Task D8 — Attributes** (`SectionCard.tsx`): names `attributes:<sectionId>`.
- [ ] **Task D9 — Summary**: adopt `ScanScopedTile` in place of the manual `ScanScope`+`TileScanFooter` pairing (keep passing its `GROUP_TITLES` resolver so the current ownership/titles are unchanged).

Each task ends: `npm run typecheck` + commit `feat(<page>): per-tile scan pill + inherited note`.

Note: `PageScanTotal` already renders on every page via `ResolutionStatusLine` — no change.

---

## Phase E — Field Notes tab (D5)

### Task E1: Vendor the HTML asset (strip external font import)

**Files:**
- Create: `ui/assets/field-notes.html` (copied from the external brief).

**Steps:**
- [ ] **Step 1:** Copy `"/Users/David.Beran/Library/CloudStorage/OneDrive-Dynatrace/Desktop/Claude/AIObsV3/AI Observability Field Notes/ai-observability-dynatrace-customer-brief_v8.html"` to `ui/assets/field-notes.html`.
- [ ] **Step 2:** Remove the single external `@import url('https://fonts.googleapis.com/...')` line (Spline Sans Mono) so CSP doesn't log a blocked-request error; the inline base64 DTFlow font stays. Leave everything else byte-for-byte.
- [ ] **Step 3:** Commit: `chore(assets): vendor AI Observability field-notes HTML (external font import stripped)`.

### Task E2: FieldNotes page + route + nav

**Files:**
- Create: `ui/app/pages/FieldNotes/FieldNotesPage.tsx`.
- Modify: `ui/app/App.tsx` (import + `<Route path="/field-notes" …>`).
- Modify: `ui/app/components/Header.tsx` (`NAV_ITEMS` — add `{ to: "/field-notes", label: "Field Notes" }` last, after About).

**Steps:**
- [ ] **Step 1: Implement the page:**
```tsx
import React from "react";

/** Static reference doc, served same-origin from /ui/assets and framed for
 *  CSP isolation. */
export const FieldNotesPage = () => (
  <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "80vh" }}>
    <iframe
      src="assets/field-notes.html"
      title="AI Observability Field Notes"
      style={{ flex: 1, width: "100%", minHeight: "80vh", border: 0 }}
    />
  </div>
);
```
- [ ] **Step 2:** Add the route in `App.tsx` and the `NAV_ITEMS` entry in `Header.tsx`.
- [ ] **Step 3:** `npm run build`, then `npm run start` (or the deployed build) and **verify in a real browser** that the iframe renders the document (CSP allows same-origin `/ui/assets/*.html` framing). If blocked, fall back: import the file as a raw string (`?raw`) and render a sanitized body fragment via `dangerouslySetInnerHTML` with an inline eslint-disable (document the larger-bundle tradeoff).
- [ ] **Step 4:** Commit: `feat(nav): Field Notes reference tab`.

---

## Phase F — UX improvement report (D6)

The read-only analysis workflow is already running. This phase synthesizes and gates.

### Task F1: Synthesize the report
- [ ] **Step 1:** From the workflow output, dedupe + rank suggestions (impact desc, then effort asc). Write `docs/ux-improvement-report-2026-07-05.md` grouped by page + cross-cutting lens, each item: problem / recommendation / impact / effort / category.
- [ ] **Step 2:** Build a companion visual Artifact (skim view) using the `dataviz` guidance for any charts.
- [ ] **Step 3:** Commit the report doc.

### Task F2: Triage gate (user)
- [ ] **Step 1:** Present the report; the user selects which suggestions to implement.
- [ ] **Step 2:** For the selected items only, write follow-up tasks and implement (TDD where logic-bearing), each its own commit. (Out of scope until the user picks.)

---

## Deploy & verify (after each phase with app-visible changes)

- [ ] `npm run typecheck` + `npm run lint` + `npm test` all green.
- [ ] `npm run build`.
- [ ] Deploy to ualpre (set env URL → `npm run deploy` → revert placeholder).
- [ ] Drive the app: toggle scan-debug (pills on every page), toggle the bucket filter + confirm scan drop on a page, run Detect AI buckets + scope to a bucket, open the Field Notes tab.

## Self-review coverage map (spec → tasks)
- D1 remove density/tileStyle → A1–A3. D2 scan pills everywhere → D1–D9. D3 bucket tweak → B1–B6. D4 detect AI buckets → C1–C4. D5 Field Notes → E1–E2. D6 UX report → F1–F2. Opt-out immunity (bucket+segment) → B5 + C2. Header chip → B6. Coexistence → B5. Empty-bucket doc-only guard → B4 helper text + B6 chip.

# Bedrock timeframe-probe fix + app-wide Demo Mode (phase 1: infra + Bedrock content)

**Date:** 2026-08-02
**Scope:** first 2 of 4 sub-projects from the "merge AWSBedrockApp changes into AIObsV3" request. Sub-projects 3 (Telemetry audit checks → Attributes page + rename) and 4 (demo content for every other page) are separate, later specs.

## Goal

1. Fix a false-negative "No AWS Bedrock telemetry found" empty state that can appear even when Bedrock telemetry exists in the user's selected timeframe.
2. Introduce a **Demo Mode** so the AWS Bedrock page (and, in later phases, every other page) can be explored fully populated in a fresh tenant that has no relevant telemetry yet — both automatically (when a page's own probe finds nothing) and via a manual global override for presentations/trials.

## 1. Bedrock empty-state timeframe bug

**Root cause:** `useBedrockAvailable()` in `ui/app/bedrock/useBedrock.ts:36-41` runs a cheap existence probe hardcoded to `from: now()-24h`, decoupled from `scope.timeframe`, which every other query on `BedrockPage.tsx` honors. Selecting a historical window with real Bedrock data but nothing in the trailing 24h makes the probe return `available: false`, and the page renders nothing but the `EmptyState` even though the selected timeframe's real queries would return data.

**Fix:**
- Change `useBedrockAvailable` to accept the active timeframe: `useBedrockAvailable(timeframe: Timeframe)`.
- Build the probe query's `from`/`to` from that timeframe (`timeframe.from`, `timeframe.to ?? "now()"`) instead of the literal `now()-24h`, mirroring the existing correct pattern in `ui/app/scope/CapabilityContext.tsx:90-96`.
- `BedrockPage.tsx` passes `scope.timeframe` (already in scope there) at the call site.
- Keep the `limit 1` cheap-check shape and existing `isLoading`/`probing` gate — the page still waits for the probe to resolve before deciding.
- Scope the probe to **timeframe only**, not Account/Model filters — matches `CapabilityContext` convention, keeps the probe cheap, and an Account/Model mismatch is better surfaced by individual tiles showing empty rows than by blocking the whole page.

**Tests:** unit test on the query builder asserting `from`/`to` reflect the passed timeframe, not a hardcoded literal. Manual check on ualpre with a historical window containing known older Bedrock data but nothing in the last 24h.

## 2. Demo Mode

### Flags (`ui/app/tweaks/TweaksContext.tsx`)

- **`showExampleData`** — exists today, unchanged in meaning: narrow, per-tile capability-gap fill-in (a tile detects its own specific capability is absent and substitutes a hardcoded example when this is on). Not touched by this phase.
- **`demoMode`** (new) — global override. When on:
  - every wired page/tile renders its demo dataset regardless of whether real data would have been available
  - a persistent app-wide banner appears (new `DemoModeBanner` component, rendered in the page header, mirrors the standalone app's copy: "You're viewing demo data, not live telemetry" + one-click disable)
  - Tweaks panel gains a new "Data source" section (top of `TweaksPanel.tsx`, before Appearance) with a segmented Demo Mode on/off control
- **Automatic per-page fallback** (not a flag — a computed value): when a page's own availability probe resolves to "nothing found" and `demoMode` is off, the page renders its demo dataset anyway instead of a blocking `EmptyState`, with a small inline amber notice (new `ExampleDataNotice` component: "No AWS Bedrock telemetry detected — showing example data" + link to the Telemetry/Attributes audit). This is what makes the feature work automatically for a freshly-installed tenant with no relevant telemetry, with zero user action required. When `demoMode` is on, this per-page notice is suppressed in favor of the persistent global banner (avoid double messaging).

### Mechanism

Both are combined once per page into a single `showExample` boolean carried on that page's scope object (e.g. `BedrockScope.showExample`):

```ts
const showExample = demoMode || (!availLoading && !available);
```

Every data hook on that page takes the scope (or a bare `showExample` param for hooks that predate scope objects) and:

```ts
const res = useScopedDql(query, { ...opts, enabled: !showExample });
return useMemo(() => {
  if (showExample) return DEMO_X;
  // ...parse real res.data as today
}, [showExample, res.data, res.isLoading, res.error]);
```

Components themselves stay unaware of `showExample` — they just render whatever the hook returns. No new display primitives are needed; reuse `ExampleDataFrame` / `MissingDataHint` / `BlendedBadge` (`ui/app/components/displayHints.tsx`) wherever a demo-populated section should visually flag itself as non-real (matching how they're already used for `showExampleData` today).

### Bedrock content (this phase's concrete deliverable)

- Port `ui/app/bedrock/demoData.ts` and `ui/app/bedrock/governance/demoData.ts` from `AWSBedrockApp` into the AIObsV3 equivalents, adjusting only where hook return shapes or import paths differ. These are typed constants whose shape matches each real hook's return type, derived from one coherent seed dataset per domain (Runtime, Governance) run through the real parse/fold/aggregate functions — not independently hand-typed numbers per tile.
- Wire the `showExample` branch (per the Mechanism above) into every exported hook in `ui/app/bedrock/useBedrock.ts`, `ui/app/bedrock/useRuntimeMetrics.ts`, `ui/app/bedrock/useGuardrails.ts`, and the governance equivalents in `ui/app/bedrock/governance/useGovernance.ts`.
- `BedrockPage.tsx` computes `showExample` from `demoMode` + the (now timeframe-scoped) `available` probe, and passes it down via the scope objects it already builds for Runtime/Governance views.
- This makes AWS Bedrock the first fully-realized Demo Mode page, proving the mechanism end-to-end before it's rolled out to the rest of the app in a later phase.

### Explicitly out of scope for this phase

- Telemetry audit checks port + Attributes→Telemetry rename (separate spec).
- Demo content for Summary, Pulse, Explorer, Agents, Models, Prompts, Attributes/Telemetry (separate, later phase — each page gets its own seed dataset following the same pattern proven here).
- Any change to the existing narrow `showExampleData` call sites (`QualityTrustCard`, `SessionUserCostPanel`, `tilePopups.tsx`) — they keep working exactly as they do today.

## Testing

- Unit tests for the timeframe fix (query builder) and for the `showExample` computation (`demoMode` on → true; probe unresolved → false; probe resolved empty → true; probe resolved present → false).
- Existing Bedrock hook tests extended to cover the demo-data branch (asserts hook returns the `DEMO_*` constant unchanged when `showExample` is true, and never fires the real `useScopedDql` query — i.e. `enabled: false`).
- Manual verification: toggle Demo Mode on ualpre/a tenant, confirm the whole Bedrock page (Runtime + Governance) populates with realistic numbers and the banner appears; toggle off, confirm real data (or the real empty state, if genuinely absent) returns.

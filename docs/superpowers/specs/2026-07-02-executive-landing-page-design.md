# Executive Landing Page ("Overview") + Custom App Icon — Design

**Date:** 2026-07-02
**Branch:** redesign-5-tab
**Status:** Approved design → implementation planning

## 1. Purpose

Give the app a compelling front door aimed at senior / executive leadership. In one
screen a leader should understand:

- **What** the app is (end-to-end observability for agentic AI workloads),
- **Why** it matters (cost, reliability, and safety of AI in production),
- **The state of AI right now** — the metrics the operational tabs surface, distilled
  into an executive snapshot, and
- **How to navigate** — where to go for deeper detail.

The page must be **data-dense yet extremely visually polished** — the kind of screen a
leader finds genuinely compelling, not a wall of numbers. Every high-level metric is a
launch point into the tab that owns the detail (drill-through), complemented by an
explicit "navigate the app" card layer.

## 2. Placement & routing

- New **`OverviewPage`** becomes the front door at **`/`**. Pulse moves to **`/pulse`
  only** (it no longer owns `/`).
- Nav bar gains **"Overview"** as the first item; the app logo also links to `/`.
- `Header.isActive`: Overview owns `/` and `/overview`; Pulse owns only `/pulse`.
- Folded-tab redirects (`/tools`, `/topology`, `/mcp-health`, `/finops`) unchanged.
- **Delete dead scaffold:** remove `ui/app/pages/Home.tsx` and `ui/app/pages/Data.tsx`
  (unused CLI scaffold, only reachable at `/home`) and their `/home` route. Remove the
  now-unused `Card` component only if nothing else imports it (verify first).

## 3. Fixed 24h scope (overrides the global timeframe on this page only)

- The landing is a **fixed "last 24 hours" snapshot**, independent of the header
  timeframe selector.
- Mechanism: a small **`FixedScopeProvider`** wraps only the Overview page and provides
  the shared `ScopeContext` value with `timeframe` pinned to `{ from: "now()-24h", to:
  "now()" }`; its `setTimeframe`/`reset` are no-ops. Because every data hook already
  reads `useScope()`, all reused hooks query 24h automatically with **no per-hook
  changes**. This provider is purely in-memory and never writes the URL, so navigating
  away restores the user's own persisted timeframe on the other tabs.
- On route `/`, `Header` renders a static **"Last 24 hours"** chip in place of the
  live `HeaderTimeframe` selector (a live control that did nothing here would confuse).
  All other routes keep the live selector.
- The **global filter strip still applies** — unfiltered means whole-tenant "state of
  AI"; a leader can still scope to one app/segment.

## 4. Page structure

Sections top-to-bottom. Each drillable element uses the standard app affordance
(pointer cursor + subtle hover lift) already used on clickable tiles/cards.

- **A · Hero band** — custom app icon + app name + one-line tagline; a 2–3 sentence
  *what it is / why it matters*; and the **Reliability score ring** (Pulse's 0–100
  health: operational + quality + cost pillars) with status color, as the centerpiece
  "is my AI healthy?" number. A "Last 24 hours" context chip sits here too.
- **B · Executive KPI strip** — sparkline tiles: **AI spend**, **cost / request**,
  **token volume**, **token efficiency %**, **requests**, **P95 latency**, **error
  rate**. Reuses the Pulse sparkline-tile visual pattern.
- **C · Spend & forecast row** — **Spend Glance** (24h / 7d / projected 30d) ·
  **token + $ forecast, next 24h** · **top model by spend (24h)** headline callout.
- **D · Where the money goes — Top cost drivers (24h)** — four compact
  mini-leaderboards, each **top 3 with spend + share-of-total %**, every row clickable:
  - **Top services by spend** — cost-center / app-owner attribution.
  - **Top models (LLMs) by spend** — model rationalization.
  - **Top agents by spend** — most expensive agentic workflow.
  - **Top providers by spend** — vendor concentration / leverage.
  (No "top tool by spend" — MCP tools carry no token cost; ranking them by spend is
  meaningless. Tools are represented in the Agents tab.)
- **E · Footprint row** — count tiles: **AI services · total agents · active models ·
  model providers · total prompts** · **provider-mix donut**.
- **F · Navigate the app** — six cards (Pulse, Explorer, Agents, Prompts, Models /
  FinOps, Attributes), each with a one-line "what it answers" + deep link. The explicit
  "where do I go for X" map.

## 5. Drill-through map

Every high-level element navigates via `useTabNav`. **Every drill-through explicitly
carries `?from=now()-24h&to=now()`** so the destination opens on the exact 24h window
the leader just saw (the `FixedScopeProvider` is in-memory only, so without this the
target would render at the user's persisted timeframe — a jarring mismatch).

| Landing element | Drills to | Pre-filter |
|---|---|---|
| Reliability score ring | Pulse | — (health breakdown) |
| Spend · cost/request | Models / FinOps | — |
| Token volume · efficiency | Pulse | token-efficiency section |
| Requests · P95 · error rate | Pulse | operational |
| Spend Glance | Models / FinOps | — |
| Token/$ forecast | Models / FinOps | — |
| Top model by spend | Models | `?focus=llm` + model preselect |
| Top services leaderboard row | Models | service detail |
| Top models leaderboard row | Models | model detail |
| Top agents leaderboard row | Agents | agent preselect |
| Top providers leaderboard row | Models | provider view |
| AI services count | Explorer | — |
| Total agents | Agents | — |
| Active models | Models | — |
| Model providers · provider-mix donut | Models | provider view |
| Total prompts | Prompts | — |
| Nav cards (section F) | each tab | that tab's landing focus |

## 6. Data architecture

- **Reuse self-contained components/hooks** where already lightweight:
  - Reliability score — `usePulseHealth`.
  - KPI strip values + sparklines — `usePulseSummary` (already returns spend, cost/req,
    tokens, efficiency, requests, P95, error rate, and per-tile spark series).
  - Spend Glance — `Pulse/SpendGlance` + `useDailySpend`/`useSpendBreakdown`.
  - Token/$ forecast — `useTokenForecast`.
  - Provider mix — `Pulse/ProviderMixDonut` + `useProviderMix`.
- **New compact `useOverview` hook(s)** with dedicated lightweight grouped DQL for the
  data not already cheaply available, rather than dragging full-table hooks
  (`useAgents`/`useModels`/`useAIServices`) onto the landing:
  - Footprint counts: AI services, total agents, active models, model providers, total
    prompts.
  - Cost-driver leaderboards: top services / models / agents / providers by spend
    (grouped, top-3, via the same `costOf` pricing model the app already uses).
  - Top model by spend (headline callout — may fall out of the leaderboard query).
  - Query builders are **pure functions**, unit-tested like existing `queries.test.ts`.
- All reads respect sampling extrapolation the same way existing hooks do (counts/sums
  extrapolate by sampling ratio; ratios/percentiles are sampling-invariant).
- **Graceful empty / missing-data states** (per the redesign missing-data-hint
  decision) when a tenant has no AI spans in the last 24h — every section degrades to a
  helpful hint, never a broken tile.

## 7. Visual design language (first-class requirement)

The page must feel premium and intentional, not a default dashboard grid.

- Built on Strato components + `strato-design-tokens` (Colors / Borders / Spacings) and
  the app's existing CSS token vars (`--blue`, `--purple-2`, `--cyan`, `--green-2`,
  `--text`, `--text-3`, etc.) so it is theme-correct in light and dark automatically.
- **Hero** carries the strongest visual weight: the reliability ring is the focal
  point, paired with the animated pulse-network motif from the app icon as a subtle
  hero accent. A restrained gradient / layered-surface treatment sets it apart from the
  operational tabs without inventing off-brand colors.
- **KPI tiles**: large numerals, uppercase micro-labels (the `MiniStat` idiom),
  in-tile sparklines, clear delta/trend cues. Consistent tile height and rhythm.
- **Leaderboards**: rank + name + spend + a share bar; tight vertical rhythm; color
  pinned by rank (matches the app's `SLICE_COLORS` convention).
- **Motion, tasteful and subtle**: number count-up on first paint, sparkline draw-in,
  ring sweep — all short, GPU-friendly, and respecting `prefers-reduced-motion`.
- Generous whitespace and a clear visual hierarchy: hero → KPIs → money → footprint →
  navigation. Responsive: sections reflow to fewer columns at narrow widths.
- Detailed aesthetic direction (typography scale, spacing, gradient specifics) is
  deferred to the implementation phase via the `frontend-design` skill.

## 8. Custom app icon — "Pulse + agent network"

- New **`ui/assets/icon.svg`**: a heartbeat / pulse waveform threading through 3–4
  connected agent nodes, in the app's blue → purple → cyan token palette. Includes a
  clean single-weight rendering that reads at small launcher-tile size.
- Referenced via `app.config.json` → `app.icon` (currently unset → auto-generated).
- Reuses the node/agent visual vocabulary already in
  `ui/app/pages/Pulse/archMap/icons.tsx`.
- The same motif drives the subtle hero accent on the landing page (section 7).

## 9. Testing

- Vitest unit tests for:
  - New query builders (pure functions) — shape and grouping.
  - `FixedScopeProvider` — supplies a pinned 24h timeframe and no-op setters.
  - Drill-through URL construction — every drill carries `from=now()-24h&to=now()`.
  - `Header.isActive` — Overview owns `/`, Pulse owns `/pulse`.
- Existing suite must stay green (routing change + scaffold deletion).

## 10. Out of scope

- No new backend / OpenPipeline changes.
- No change to how other tabs treat timeframe (they keep the live selector).
- No new provider-cost pricing sources beyond the existing `costOf` model.

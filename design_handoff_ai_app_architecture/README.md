# Handoff: AI Application Architecture diagram (Pulse page)

## Overview

This package specifies a redesigned **AI Application Architecture** panel for the **Pulse** page of the *AI Observability 3.0* Dynatrace app (repo: `dberanjr/AIObservability3.0`). It replaces the current architecture diagram (the vertical stack of full-width tier cards) with an **interactive node-map**: a top-down request-path graph of the AI application's tiers, with volume-weighted edges, a feedback-loop edge, per-tier health/metrics, inline finding markers, lens-driven "spotlight" analysis, and a detail popup system. Below the map sits the rest of the Pulse page (fleet KPI tiles, a token-consumption chart, top-agents-by-cost, and an active-findings list).

The diagram is built entirely from `gen_ai.*` OpenTelemetry spans (the same data the rest of the app reads). It answers, at a glance: *what does our AI request path look like, where is it unhealthy, and what should we fix first.*

There is also an **open implementation question** at the end (dynamic tier inclusion based on detected tenant signals) that the user wants you to evaluate.

## About the design files

The files in `prototype/` are a **design reference built in HTML/CSS + React (via in-browser Babel)** — a working prototype that demonstrates the intended look, layout, motion, and interactions. **They are not meant to be shipped as-is.** Your task is to **recreate this design inside the existing app's environment**: React + TypeScript, the **Strato** design system (`@dynatrace/strato-components-preview`, `@dynatrace/strato-design-tokens`, `@dynatrace/strato-icons`), and the app's established patterns (the Pulse page lives under `ui/app/pages/Pulse/`). Use real Strato components/tokens where they fit; reproduce the bespoke node-map with SVG + tokens (Strato has no node-graph primitive).

The prototype uses **plain data constants** (`data.js`) as stand-ins for query results. In the real app, wire these to the existing DQL/`gen_ai.*` data layer.

## Fidelity

**High-fidelity.** Colors, type, spacing, iconography, motion, and interactions are intended to be reproduced faithfully. Exact token values are listed under **Design tokens**. Where the prototype uses a literal value that maps to a Strato token, the token is the source of truth — prefer it.

---

## Layout (the whole Pulse page, top to bottom)

The app chrome (top nav header, scope toolbar, context strip) already exists in the app — **keep it**; only two chrome changes are described below. Everything inside the scroll area is what this handoff covers.

1. **App header** (existing `Header.tsx`): logo + nav pills (Pulse active = solid Dynatrace-blue pill, white text) + timeframe selector + "Model Rates" + "Tweaks". No change.
2. **Scope toolbar** (existing): Segments / Sampling / Scan limit / Filters / Reset. No change.
3. **Context strip** (existing): **CHANGE — on the Pulse page only**, show just the scope label (e.g. **"Fleet-wide"**) plus the right-aligned "Scope further with Segments…" hint and "Last refreshed …". The service/agent/tool counts were **removed from the strip on Pulse** because the diagram now carries them (avoid duplication). Other pages keep the full strip.
4. **Architecture panel** (the focus — see below).
5. **Pulse rest**: KPI tiles → Token consumption chart → (Top agents by cost | Active findings). See **Pulse rest** section.

---

## Screen: AI Application Architecture panel

A single Strato card (1px border, ~7px radius, surface bg, soft shadow), max-width ~1180px, centered.

### Panel header
- **Title**: "AI Application Architecture" (~23px / 800).
- **Subtitle** (one line): `Fleet-wide · {N} services · {N} agents · {N} tools · {N} active findings`. The four counts are **clickable chips** (hover: subtle shell bg, bold number) → open the **detail modal** (scope detail; see Interactions). "Fleet-wide" is plain text.
- **Right column** (stacked, right-aligned):
  - **Live badge** (toggleable): a small breathing green dot + `Live · updated {refreshed}`. The dot has a CSS ping pulse.
  - **Lens control**: label "Lens" + three pills on one row: **Cut cost**, **Chase latency**, **Stop a loop**. Pills: white, 1px border, ~7px radius, 14px. Selected pill = solid accent (Dynatrace blue) fill, white text. Clicking the active lens again deselects (returns to "Overview").

### The node-map

A top-down graph laid out on a centered grid; an absolutely-positioned SVG overlay draws the edges, and DOM overlays carry the edge pills / loop pill / packets / rate tooltip. Edge geometry is **measured from the live node DOM rects** (via refs + `ResizeObserver` + re-measure on `document.fonts.ready`) so connectors always anchor correctly regardless of content size. Recreate with the same measure-then-draw approach (or a layout lib), not hard-coded coordinates.

**Tiers (nodes), in request-path order:**

| id | Title | Category (title color) | Instrumented? (border) | Health (overview) | Headline metric (overview) | Badges (overview) | Tier icon |
|---|---|---|---|---|---|---|---|
| client | Client | edge (dark) | no → **dashed** | muted (gray dot) | — (mono sub: "no native OTel · identity source") | — | monitor |
| gateway | Gateway / Proxy | edge (dark) | no → **dashed** | muted | — (mono sub: "no native OTel") | enrich chip "+ enrich: injection" | shield |
| orchestrator | Orchestrator | core (indigo) | yes → solid | **critical** (red) | **144,053** workflow spans | "loop rate 63%" (critical) | workflow/network |
| agent | Agent | core (indigo) | yes → solid | **warning** (orange) | **370,260** agent spans | "0.0% err", "p90 1 ms" (gray) | bot |
| tools | Tool execution | resource (teal) | yes → solid | good (green) | **85,265** tool calls | "N+1 ×412" (warning) | wrench |
| llm | LLM provider API | resource (teal) | yes → solid | good (green) | **176,566** calls | "$411" (gray), "ctx-exhaust ×12" (warning); node has a faint warning-tint bg | sparkle |
| vector | Vector DB / RAG | resource (teal) | no → **dashed** | good (green dot) | — (mono sub: "12.4k queries · top-k 8") | enrich chip "+ eval: hallucination" | database |
| memory | Memory / state | resource (teal) | no → **dashed** | muted | — (mono sub: "session state · history") | — | layers |

**Node anatomy:**
- A **tier-icon tile** (30×30, ~8px radius, category-tinted bg ≈ `color-mix(category-color 13%, transparent)`, icon in the category color) with a **health status dot** (10px) pinned to its top-right corner (red/orange/green/gray).
- **Title** (16px / 700) in the category color (edge=neutral-default text, core=indigo, resource=teal).
- Instrumented nodes ("data" nodes): a big **headline number** (~26px / 800) + unit label, an optional **badge row**, and a small **sparkline** (top-right of the header, colored by health). Numbers **count up** on mount/lens-change.
- Non-instrumented nodes ("meta" nodes): a **monospace subtitle** instead of a number; **dashed border**, transparent bg.
- **Finding-count badge**: a numbered circle (red=critical, orange=warning) pinned to the node's top-right corner. Overview counts: Orchestrator **1** (critical), Agent **2** (warning), Tool execution **1** (warning), LLM **3** (warning).
- **Enrich chip**: a small dashed pill (indigo text/border, mono) on Gateway and Vector DB — a suggested enrichment/eval.

**Edges (parent → child), with `w` = relative throughput weight (drives thickness):**
`client→gateway` (0.22) · `gateway→orchestrator` (0.30) · `orchestrator→agent` (**1.0**, the thick spine) · `agent→tools` (0.50, finding) · `agent→llm` (0.62, finding) · `tools→vector` (0.30, finding) · `llm→memory` (0.22).

- **Stroke width = `2.5 + w * 17` px** (pronounced volume encoding: ~6px thin → ~19.5px for the Orchestrator→Agent spine). Color: neutral edge gray; a faint dashed "flow" overlay animates along it (direction of flow).
- **Arrowhead** at the child end (neutral fill).
- **Finding edges** carry a clickable **finding pill** at their midpoint (replaces a plain marker): a rounded pill with a small diamond glyph + short label, warning-toned: `agent→tools` = "N+1 ×412", `agent→llm` = "ctx ×12", `tools→vector` = "recall 61%".
- **Flowing packets** (toggleable): small dots travel each edge along its path (CSS `offset-path`), count and speed proportional to `w` — a live-throughput cue.

**Feedback loop edge:** a dashed **magenta** edge curving from the **LLM** tier's right side up to the **Orchestrator's** right side, with an arrowhead into Orchestrator and a **"LOOP 63%"** pill on the curve. Implementation note: draw it as a **solid base line + a dashed animated overlay on top** (not a single dashed animated path) so the **arrowhead always stays visually connected** to the line. The loop also carries packets (magenta) when packets are on.

**Legend row** (bottom of panel, mono 12px): health dots (green/orange/red) "health" · dashed box "no native OTel" · thick line "edge = call volume" · finding pill sample "cross-layer finding" · numbered circle "findings on layer".

**Footer**: italic note "Fleet KPI tiles and the token-consumption chart continue below the map · select any node or marker for detail." + a circular **down-arrow button** that smooth-scrolls to the KPI tiles (implement the scroll as a manual `requestAnimationFrame` tween — native `scrollTo({behavior:'smooth'})` was unreliable in some runtimes).

### Per-lens behavior (the "spotlight")

Selecting a lens does three things:
1. **Re-headlines** every tier with that lens's metric (e.g. Cut cost → Orchestrator shows "$3.2K orchestration overhead"; Chase latency → "4.8 s p90 wait"; Stop a loop → "63% loop rate").
2. **Spotlights the offending path**: emphasizes the relevant nodes + edges and **dims everything else** (dimmed = ~0.34 opacity, desaturated). Spotlight sets:
   - **Cut cost** → nodes {orchestrator, agent, llm}, edges {orchestrator→agent, agent→llm}.
   - **Chase latency** → nodes {gateway, orchestrator, agent}, edges {gateway→orchestrator, orchestrator→agent}.
   - **Stop a loop** → nodes {orchestrator, agent}, edge {orchestrator→agent}, **loop edge emphasized** (thicker, faster dash).
3. Shows a **recommended-action banner** above the map (severity-colored): headline + detail + a CTA button + an estimated-savings figure. (Each lens's banner copy is in `data.js` under `LENSES[*].banner`.)

---

## Interactions & behavior

- **Click a node body** → opens a right-side **detail drawer**: status, a metric grid (spans + the three lens metrics), a 24h span sparkline, a "Top contributors" bar list, and an "Open in {tab}" cross-link. Non-instrumented tiers instead explain the telemetry gap and link to an instrumentation guide.
- **Click any pill** → opens a centered **detail modal** (distinct from the drawer). Pills that open the modal: edge finding pills, the LOOP pill, enrich chips, node metric badges, and the header scope chips (services/agents/tools/findings). The modal shows: severity dot, title, scope, "what", "why it matters", an impact metric grid, an optional action CTA, and an optional drill-in link. Modal content is resolved from a single registry (`DETAILS`) via a `getDetail(spec)` function — `spec` is one of `{loop}`, `{finding:id}`, `{enrich:nodeId}`, `{scope:key}`, or `{badge:{…}}` (badges fall back to a generic metric explanation when not mapped to a rich finding).
- **Hover a node** → "trace focus": the node + its directly connected edges/neighbors stay lit; everything else dims. (Hover takes precedence over lens spotlight.)
- **Hover an edge** → a small **throughput tooltip** appears at the edge midpoint (e.g. "9.1K spans/min") — toggleable. (Note: drive this off `mouseover`/React `onMouseEnter`; the edge has an invisible wide "hit" stroke path with `pointer-events: stroke` over the visible thin line.)
- **Esc** or scrim click closes the drawer/modal.

### Motion (all reduced-motion-safe; **resting state must be fully visible**)
- **Count-up** on node numbers + KPI values (parse prefix/number/suffix; animate the number; if not animated, show the final value).
- **Flowing packets**, **flow-dash** along edges, **loop dash**, **live-dot ping** — infinite decorative loops; if not animated they sit static (never hide content).
- **Important implementation lesson:** do **not** build entrance reveals that start hidden (opacity 0 / undrawn) and depend on a CSS transition/animation to become visible — in some runtimes the animation clock is paused and the content stays stuck hidden. We deliberately **dropped** the node fade-up and edge draw-on for this reason. Keep count-up (it degrades to the final value) and the infinite decorative motions (they degrade to static). In a real, properly-rendering app you may re-introduce a draw-on entrance, but gate it so the **resting state is always visible** if the animation never runs.

### Tweaks (design knobs, not product features)
The prototype exposes a Tweaks panel: Diagram layout (map / layered / flow — **map is the real design**; layered & flow are alternate explorations you can ignore), density, flow connectors on/off, animate flow, **flowing packets** on/off, **edge rate on hover** on/off, **live indicator** on/off, dark mode, accent color. In the real app these aren't user-facing; treat the **default state** (map, packets on, live on, edge-rate on, light theme, Dynatrace-blue accent) as the spec. Dark mode should be supported via Strato theming.

---

## State management

- `lens`: `"overview" | "cut-cost" | "chase-latency" | "stop-a-loop"` (toolbar pills; clicking active → overview).
- `pickedNode`: the node whose drawer is open (or null).
- `detail`: the resolved detail object for the modal (or null), produced by `getDetail(spec)`.
- `hoverNode` / `hoverEdge`: drive the focus dimming + edge tooltip.
- Edge geometry: measured from node rects; recompute on resize / fonts-ready / lens change.
- Data: in the prototype all values are static constants. In the app, source them from the existing `gen_ai.*` query layer for the selected timeframe + segment scope.

---

## Design tokens

All from Strato (`tokens.css` in `prototype/` is the design system's `colors_and_type.css`). Use the **token**, not the literal, in the real app.

**Type:** `DT Flow` (product UI). Body 14px/400/1.5. Mono: `Roboto Mono`/`JetBrains Mono` for identifiers, scopes, and "no native OTel" subtitles.

**Brand / accent:** Dynatrace blue `#1496ff` (active nav pill, selected lens pill, focus rings, CTAs, focus-edge highlight).

**Status (semantic):**
- Critical: stroke/dot `#c62239`, text `#bb0731`, bg `#fbf2f3`, border `#f1d3d6`.
- Warning: dot `#d98613`, text `#8a5500`, bg `#fbf5ec`, border `#f3e3cb`.
- **Health "good" green:** `#5b9d2f` (dot), text `#43761e`, bg `#f1f6ec`, border `#d9e8c6`. **Flag:** this leaf-green matches the live app's status dots; Strato's `success` token is a teal (`#2f6862`). Confirm which the team wants before shipping — the prototype intentionally uses the brighter green to match the current app.
- Muted / no-data: dot `#b3b4c4`, text `#84859a`.

**Category title colors:** core (Orchestrator/Agent) indigo `#5a43d6` (≈ Strato primary `#474fcf`); resource (Tools/LLM/Vector/Memory) teal `#0b7a86`; edge (Client/Gateway) neutral text `#2f2f4f`. **Flag:** indigo/teal are chosen to read as "categories"; map them to the nearest Strato tokens and confirm.

**Map specifics:** edge gray `#c5c8d6`, edge arrow `#a3a7ba`, **loop magenta `#c026d3`** (flag: brighter than Strato chart magenta `#9033a3`; confirm). Edge width = `2.5 + w*17` px.

**Neutrals/surfaces:** surface `#fff`, base `#f9f9fa`, shell `#f2f2f5`, border `#dadbe4`, border-subdued `#ebecf0`, text `#2f2f4f`, text-subdued `#595a7d`, text-faint `#84859a`. (Dark theme values are in `tokens.css` / the prototype's `[data-theme="dark"]` block.)

**Radii:** chips/inputs ~3px, cards ~5–7px, nodes 10px, badges/pills 999px. **Shadows:** soft (card `0 1px 2px rgba(20,22,40,.05)`, raised `0 4px 16px rgba(20,22,40,.10)`). **Spacing:** Strato non-linear scale (4/8/12/16/20/24…).

**Icons:** the prototype hand-draws line icons (monitor, shield, workflow, bot, wrench, sparkle, database, layers). In the app, use the equivalent **`@dynatrace/strato-icons`** glyphs.

---

## Assets

No external image/font assets beyond the **DT Flow** webfont (already in the app) and Strato icons. The tier icons, sparklines, charts, and node graph are all inline SVG.

## Files (in `prototype/`)

- `AI Application Architecture.html` — entry; loads React 18 + Babel, then the scripts below. Open this to see the design.
- `data.js` — the data model: `LENSES`, `NODES`, `EDGES`, `LOOP`, `LENS_SPOTLIGHT`, `DETAILS` + `getDetail()`, `KPIS`, `MODELS`, `TOKENS`, `AGENTS_COST`, `FINDINGS`, `SCOPE`. **Read this first** — it's the content/spec source of truth.
- `map.jsx` — the node-map: tier icons, `CountUp`, `MapNode`, `MapView` (measurement, edges, packets, loop, focus/spotlight, rate tooltip).
- `pulse.jsx` — the Pulse-rest sections (KPI tiles, token chart, top agents, findings list).
- `app.jsx` — app shell (header/toolbar/context), `Panel`, lens control, `Drawer`, `DetailModal`, Tweaks wiring.
- `styles.css` — all component styling (built on Strato tokens). Map specifics near the bottom.
- `tokens.css` — Strato design tokens (light + dark). Reference for exact values.
- `tweaks-panel.jsx` — the prototype's Tweaks shell (not part of the product UI).

---

## Pulse rest (below the map)

- **KPI tiles** (row of 6): AI spans `971K` (+8.2%), Token spend `$26.6K` (+14%, bad), p90 latency `5.9 s` (+21%, bad), Error rate `0.3%` (-0.1pp, good), Loop rate `63%` (+12pp, bad), Active findings `7` (+2). Each: uppercase label, big count-up value, a colored delta chip (up/down arrow), and a mini sparkline on a few.
- **Token consumption**: stacked-area chart of input+output tokens by model over 24h (gpt-4o 71% / gpt-4o-mini 21% / text-embedding-3 8%) with a header total ("1.42B tokens · $26.6K spend") and a model legend.
- **Top agents by cost**: ranked horizontal bar list (research_agent $11.2K … billing_agent $2.1K) with model attribution.
- **Active findings**: list of the 7 findings (severity dot, title, mono scope, metric, chevron). Each row opens the same **detail modal** as the map pills (via `getDetail(spec)`).

---

## OPEN QUESTION for the developer — dynamic tier inclusion

The user wants to know: **can the architecture diagram dynamically include/exclude tiers based on the signals actually detected in the tenant?** (e.g. don't show a "Vector DB / RAG" tier if no retrieval spans exist; show "Gateway / Proxy" only if proxy/HTTP spans are present; etc.)

Please evaluate and propose an approach. A suggested direction to react to:

- **Detect per tier from `gen_ai.*` + related spans.** Roughly: *Orchestrator* ← workflow/chain spans (`gen_ai.operation` = chain/workflow); *Agent* ← `gen_ai.agent.*`; *Tool execution* ← `gen_ai.tool.*`; *LLM* ← `gen_ai.request.model` / LLM call spans; *Vector DB / RAG* ← vector/retrieval tool spans (`db.system` = vector, or `tool.name` ~ vector/search) — *inferred*, hence its dashed "no native OTel" treatment; *Memory / state* ← session/state store spans; *Client* / *Gateway* ← upstream HTTP/proxy spans or are always shown as **instrumentation-gap placeholders**.
- **Three states per tier, not two:** **present & instrumented** (solid node with metrics), **present but not natively instrumented / inferred** (dashed node, enrich/eval suggestion — like Vector DB and Memory today), and **absent** (hidden, OR shown ghosted as a suggested-but-undetected tier). Decide whether "absent" should hide the node entirely or show a faint "not detected" placeholder that doubles as an onboarding nudge — the latter keeps the canonical shape recognizable and guides instrumentation, which fits Strato's "helpful empty state" voice.
- **Edges follow nodes:** when a tier is hidden, re-route or drop its edges so the graph stays connected (e.g. if Vector DB is absent, `tools→vector` disappears; the loop still anchors LLM→Orchestrator).
- **Keep it declarative:** the prototype already models the graph as data (`NODES` + `EDGES` + `LENS_SPOTLIGHT`). The cleanest implementation is a **detection pass** that, for the selected timeframe/segment, computes a per-tier presence/instrumentation state, then filters `NODES`/`EDGES` before layout — so the same renderer handles any detected topology. Confirm whether detection should run client-side off an aggregate query or be precomputed server-side.

Please confirm feasibility against the real query layer, flag any `gen_ai.*` attributes that aren't reliably emitted, and recommend the hide-vs-ghost behavior for undetected tiers.

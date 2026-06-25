# AI Observability 3.0

End-to-end observability for agentic AI workloads, built as a native Dynatrace AppEngine app.

AI Observability 3.0 turns OpenTelemetry GenAI spans collected in Dynatrace Grail into an opinionated control plane for agents, tools, models, prompts, and spend. It works against the entire fleet by default and supports Dynatrace Segments to slice activity by logical filters (teams, services, deployments, environments).

---

## What it does

Modern AI applications fan out across orchestrators, agents, tools, RAG pipelines, and a half-dozen model providers. The data is in Grail thanks to the OpenTelemetry GenAI semantic conventions, but the questions teams actually need to answer — *which agent is regressing? which model is the most expensive per useful answer? where is latency coming from?* — require a UI that understands the shape of agentic systems.

That's what this app provides: five purpose-built tabs — organized around the AI Application Architecture and around complete investigations — that read the same `gen_ai.*` spans your collectors already emit, normalize provider/model identity (including Bedrock vendor unwrapping), price every request through a cache-aware cost model, and surface layer-tagged findings you can pivot from directly into Traces, Services, and Problems.

## Features

**Five** purpose-built tabs — **Pulse · Explorer · Agents · Prompts · Models / FinOps** — each reading the same `gen_ai.*` spans and sharing one global scope (timeframe + segments + filters). The navigation is organized around the **AI Application Architecture** and around complete investigations, not isolated features: the old Tools and Topology tabs fold into **Agents** (as per-agent sub-views), MCP Health folds into **Pulse**, and FinOps merges into **Models / FinOps**. Every chart can be expanded to a modal, most values are click-to-filter, and each tab degrades gracefully with a data-gap note (or optional **example data**) when an attribute your telemetry doesn't emit yet would otherwise power a panel.

> **The Pulse architecture map is the app's primary navigation surface.** A fixed schematic of the eight AI layers (client → gateway → orchestrator → agent, then tools & llm, then vectordb & memory, with a reasoning-loop arc from the LLM back to the orchestrator) renders live health per layer and routes clicks to the owning tab — a secondary router that supplements, and never replaces, the persistent top tab bar. See Pulse below.

> **All cost figures flow through one cache-aware cost model.** A single source of truth decomposes every call into uncached-input / cache-read / cache-write / output tiers, prices each from the overrideable rate table, and emits both an `effectiveCost` and a `billableTokens` count. No metric or detector computes cost or flags token volume from raw `input_tokens`. Models missing from the table fall back to a **blended rate** (never $0), flagged with a subtle "≈".

### Pulse — fleet health, efficiency & the architecture map

One-screen health and efficiency dashboard for the whole AI footprint, fronted by the architecture map.

- **AI Application Architecture map** *(hero)* — the eight layers as a live schematic: each node shows a health glyph driven by that layer's dominant signal (orchestrator → reasoning-loop rate; agent → error + loop rate; tools → error/retry; llm → logical-error + truncation + rate-limit; vectordb/memory → capability-gated), routes to the owning tab on click, and expands to a problem-pattern card sourced from the layer model. `gateway` is an `otelGap` layer — it shows a "no native OTel" chip, never a fabricated reading; the **`client` layer is reconstructed from Smartscape topology** (see below). A **use-case lens** (Cut cost · Chase latency · Stop a loop) highlights the contributing layers.
- **Client layer · upstream callers** *(reconstructed from Smartscape `calls` topology)* — the services that call into your AI services aren't captured on the `gen_ai.*` spans (no `parent.service.name`), so the Client node is reconstructed from Smartscape `calls` edges: it shows the **count of upstream caller services** plus aggregate **error-rate** and **worst-p90** chips and a throughput sparkline. Clicking the node opens a drawer listing each upstream service (requests · error % · p90, each with a mini throughput chart); **clicking any service filters the whole app** to it.
- **MCP summary strip** *(auto-appears)* — MCP requests, tool calls, and error rate, shown when MCP spans are detected.
- **Spend glance** — 24h / 7d / projected-30d effective cost (through the cost model); full analysis lives in Models / FinOps.
- **Summary tiles** — Tokens, Spend (blended estimate), P95 latency, Error rate, Models, MCP servers, MCP tools, Cost / request, and Token efficiency. Each tile carries a sparkline or donut glyph and expands to a modal with a full-size chart, a stats grid (total / avg / min / max / resolution), and sortable breakdown tables (model / server / tool, with latency percentiles, error and cost columns).
- **Token-efficiency panel** — A composite **Token efficiency score** (output leverage 50% · completion/truncation 30% · throughput 20%) and an **Output-per-dollar** tile, each with the drivers behind the number.
- **Platform health card** — Three scored pillars (Operational, Quality, Cost) with status, reasons, and an expandable "what's contributing" view (slowest agents, slowest models, highest-error agents).
- **Latency-tier breakdown** — Stacked share of wall-clock time across LLM / Retrieval-DB / Tool / Orchestration, with per-tier span counts and avg/P95.
- **Token-consumption chart** — Tokens vs. estimated cost over time with a **Dynatrace Intelligence forecast** overlay (confidence bands) and timeline brush-zoom that emits ISO timestamps for a reproducible window.
- **Top Findings strip** — Threshold-detected findings ("Dynatrace Intelligence"), each **tagged with its architecture layer** and opening a finding drawer with drill-out intents. Detectors include latency/cost/token spikes, runaway agents, **within-trace billable-token growth** (scratchpad/history bloat, on `billableTokens` so a cached-prefix loop doesn't fire), **model fallback / mismatch** (version-normalized), **context-window truncation**, **provider rate-limit / backoff**, and **TTFT degradation** (capability-gated).
- **Activity histogram** (24h request distribution with peak/quiet/avg), **Top models** bar list, **per-agent cost** bar list, and a **provider-mix** donut (Bedrock-proxied vendors unwrapped).
- **Safety & guardrails** *(auto-appears)* — guardrail-checked and PII-flagged span counts plus a breakdown of guardrail outcomes, shown when `gen_ai.*.guardrail_*` / `gen_ai.privacy.*` are emitted.
- **Feedback & prompt versions** *(auto-appears)* — feedback volume, average rating, label breakdown, and distinct prompt versions, shown when `gen_ai.feedback.*` / `gen_ai.prompt_hub.*` are emitted.

### Explorer — AI-service discovery

Service-centric browser over all AI activity.

- **Summary tiles** — AI services, LLM requests, Tokens, Active models, Concentration (top-service share), Errors, and **Logical errors** (HTTP-200 responses that are really failures — refusals, content filtering, max-token truncation).
- **Faceted sidebar** — Search plus provider / framework / model facets (each with counts), wired to URL params for shareable views.
- **AI services table** — Status dot (by error rate), service, framework badge, model chips (provider-colored), LLM requests, tokens, tokens/request, agent count, errors, and logical errors; rows open a finding drawer with drill-outs.
- **Service × Model heatmap** — Token volume per service/model cell (log-scaled), hoverable and click-to-filter.
- **Retrieval (RAG)** *(auto-appears)* — retrieval volume, distinct vector stores, average top-k, and a per-store breakdown, shown when `db.system` / `vector_db.*` are emitted.

### Agents — per-agent performance, cost & quality

- **View / operation slicers** — All / Slow (P90 > 2s) / Expensive / Most-used, crossed with Chat / Completion / Embeddings.
- **Substantive vs. orchestration partitioning** — Framework internals (LangGraph/Runnable nodes, output parsers, prompt templates, and zero-LLM/zero-tool sub-200ms steps) are split out of the headline agent counts into a collapsible **Orchestration** section.
- **Agents table** — Invocations, P90, P99, optional TTFT, error %, cost/invocation, and a mini **stage-breakdown bar** (LLM / Tool / Retrieval / Orchestration). Rows expand to stage mix, latency percentiles (P50/P90/P99/avg), and a cost breakdown; an SLA-health column appears when custom thresholds are configured.
- **Evaluation banner** — Tool-call correctness, hallucination rate, task-success rate, and avg context tokens from `gen_ai.evaluation.*` (with a preview mode and setup guide when absent).
- **Degradation-trend panel** — Top slow agents vs. their rolling 7-day Intelligence baseline.
- **Agent-loop detection** — Flags LangGraph runs that revisit nodes (≥2× avg) or run deep (≥20 steps), with loop-rate, max-revisits, and max-steps per agent.
- **High tool-frequency badge** — Marks any agent where a single tool was called above a configurable threshold within the timeframe (the AI analogue of an N+1 query).
- **Per-agent detail sub-tabs** *(absorb the retired Tools & Topology tabs)* — selecting an agent row opens its summary plus:
  - **Tools** — a tool-call table scoped to that agent (calls, avg, P90, error %, retry %); reuses the per-tool query with an agent filter. Tool definition defaults to **Discovered** (MCP / internal function spans by name), overridable via the Tweaks "Agent tools · definition" switch.
  - **Topology** — the agent's own call topology, rendered by the *existing* force-graph renderer scoped to the selected agent (not the fleet graph).
  - **Context stores** — retrieval (RAG) and memory/state as siblings, each independently capability-gated; a single EmptyState when neither is present.
- **Upstream services** (from Smartscape topology), plus **SLA-config** and **Intelligence-detector** setup drawers.

### Prompts — message-level inspection

The richest tab: a searchable record of every LLM/agent interaction.

- **Stream / Metadata / Evaluations views** with a wide, column-selectable table — time, AI app, model, type, temperature (color-banded), duration, in/out tokens, in/out cost, prompt/response text, system prompt, trace ID. Rows are tinted for errors and for max-token **truncation**.
- **Percentile anomaly highlighting** — Duration, tokens, and cost cells flag amber at P90 and red at P98 (computed when ≥5 samples exist).
- **Sticky filter sidebar** — A **Problem patterns** selector at the top exposes every architecture-diagram problem pattern that lands on Prompts as a one-click filter (Context-window exhaustion, Logical errors, Provider rate-limit, Model fallback/mismatch, TTFT degradation, Tool-output token spike, Token growth, plus the trace-scoped Tool retry storm, N+1 tool calls, Top-K over-retrieval, and History growth) — the same `?focus` mechanism the Pulse drill-down uses, so the sidebar selection and the "Filtered:" chip stay in sync. Below it: Search, type/service/model/agent/provider/operation facets, status toggles (errored / PII detected / warnings / truncated), and range controls for response time, temperature, and in/out cost.
- **Privacy mode** — Per-user "Mask PII / Show raw" toggle that suppresses prompt and response content in both the table and the detail panel.
- **Detail panel** with sub-tabs: **Prompts** (full content bubbles, copy / copy-all / maximize, PII banner), **Trace** (in-app span waterfall with type indicators, search, and a span-attributes panel; open span/trace/user-session in the platform apps), **Logs** (trace logs by severity), **Topology** (per-trace dependency graph), **Eval** (score cards), and **Info** (IDs, tokens, cost, log counts).

> The standalone **Topology** tab is retired. Its force-graph renderer is reused, agent-scoped, in the Agents → Topology sub-tab; the Pulse map is the fleet-level architecture view. The **MCP Health** tab is retired — its KPIs become the auto-appearing MCP summary strip on Pulse.

### Models / FinOps — model comparison & cost attribution

Model comparison with FinOps cost analysis merged in (the standalone FinOps tab is retired). Every figure flows through the cache-aware cost model; unpriced models show a blended estimate with a "≈" badge. Model names honor the Tweaks raw/normalized toggle.

- **Type filter** — All / Generative / Embedding / Reranking.
- **Findings** — Cost/concentration risk cards (single-vendor risk, downgrade candidate, Bedrock proxy markup, Opus underused, cost spike, cache opportunity, concentration callout) open a finding drawer whose **"View contributing prompts"** drill-down lands on the Prompts tab **scoped to the finding's model(s)** (each finding carries an explicit Prompts filter, so the drill-down is never unfiltered).
- **Bubble chart** — X = total tokens (log), Y = avg latency (log), size = request volume, color = provider. Hit-testing prefers the bubble the cursor is actually inside (so the tooltip never mismatches an overlapping neighbour), and **clicking a bubble opens that model's detail modal**.
- **Side panels & table** — Top spenders (each row **click-to-open the model detail modal**) and provider mix; a sortable table with request volume, in/out tokens, context utilization, throughput (tok/s), avg/P95/P99 latency, error rate, cost, and $/1M tokens. **Each table row opens the model detail modal.** The **Timeout** column only appears when a model actually records timeouts (it reads `span.status_code == "TIMEOUT"`, which most tenants never emit — so it's hidden rather than shown as empty filler).
- **Model detail modal** *(opens from any model row / bubble / top-spender, no extra query)* — three cost views (**Actual observed · Estimated full-population · Monthly run-rate**, where Estimated scales by the sampling ratio and matches Actual when sampling is off), the model's pricing card (input/output $/M, context window, cache rates, provider, tier, blended $/1M), and golden signals (requests, error rate, timeout rate, avg/P95/P99 latency, tokens/req, in/out tokens, context util, tok/s), plus a **Filter to this model** action.
- **FinOps sections** *(collapsible, below the table)* — **daily cost stacked bar** (computed as seven independent per-day scans at a sampling floor, so the older days never truncate under the scan limit) + a **cost-concentration treemap** whose tiles **open a service detail modal** (cost trio, per-call economics, and a per-model spend breakdown, with a **Filter to this service** action); the **Model A/B swap comparison** (below); **cost efficiency by service** (now **$ per LLM call** — cost ÷ requests — with **tokens/call** as a prompt-bloat signal, since blended $/1M only reflected which models a service picked, not how efficiently it used them); the auto-appearing **prompt cache & reported cost** panel (`gen_ai.usage.cached_tokens` / `cache_creation_input_tokens` / `cost`); and a **session / user cost rollup** (effective cost + billable tokens per session and user), capability-gated on `session.id` + `gen_ai.user` (example data available via the Tweaks toggle when absent).
- **Model A/B swap comparison** — Pick two generative models and score them on a five-dimension weighted model (latency · cost/request · quality · throughput · reliability) → recommended winner, margin, verdict, and estimated monthly saving. The scoring is fully configurable: a **use-case profile** seeds the weights, **editable weight sliders** let you tune each dimension live, a **"service being compared" dropdown scopes every metric** (latency, cost/call, errors, volume) to one service's actual traffic instead of the fleet, and a **"driving upstream service" dropdown** (populated from the real Smartscape callers) sets the calling context. Quality tier and the min-quality disqualification floor come straight from the pricing table, and the monthly-saving projection uses the actual scope window.

## Cross-cutting capabilities

- **Fleet-wide by default** — Opens against your entire AI footprint; **Dynatrace Segments** (with variables) slice it down to any logical subset (teams, services, environments, deployments).
- **Global timeframe** — Header selector (30m / 1h / 6h / 24h / 7d / 14d / 30d, default 1h) that persists per user and travels across tab navigation and shareable URLs.
- **Global attribute filter & click-to-filter** — Click almost any value (model, agent, provider, service, tool, trace/span ID, k8s attribute…) to add it as an app-wide filter; high-cardinality keys (IDs) use debounced, on-demand server-side value discovery instead of pre-fetching. Injection is **hybrid**: most conditions (model, service, provider, IDs…) are applied **directly on each page's own spans** via `in(toString(attr), array(…))` — uncapped and exact, with no trace-id materialization, so a busy attribute never trips a DQL limit. Genuinely **cross-span entity filters** (agent / tool name, which can live on a different span than the one a page reads) instead resolve every matching `trace.id` (one resolver query: conditions AND across the trace, values OR within) and scope each page to those traces via `in(trace.id, array(toUid(…)))`. This is what makes a filter like *"agent A using model gpt-4o"* work when the agent name and model live on different spans of the same trace. The injected trace-id list is hard-capped (DQL allows max 250 sub-expressions per expression, so a single `in(trace.id, array(toUid×N))` caps N safely under that); the match count and an "approximate" flag surface next to the filter chips when the cap truncated the set.
- **Scan-limit selector** — query budget for the whole app; every hook routes through `useScopedDql`, which **injects** the selected `scanLimitGBytes` into every query (and injects segments + the resolved global trace-scope filter). No query hardcodes a scan limit, so the selector is the single source of truth and is honored everywhere — there is no per-query opt-out.
- **Sampling control** — Optional query-time sampling ratio (None / 10 / 100 / 1k / 10k); count and sum aggregates are transparently extrapolated, while sampling-invariant metrics (percentiles, averages, error rates, distinct counts) are left untouched.
- **Server-side provider & model normalization** — Bedrock invocations are unwrapped to their underlying vendor (Anthropic, Meta, Cohere, Mistral…) directly in DQL, and model identifiers are canonicalized (region/vendor prefixes, dates, size tags, and revisions stripped) so charts reflect the real model, not the gateway. The raw string is one Tweaks toggle away.
- **Cache-aware cost model** — A single source of truth prices every call across uncached-input / cache-read / cache-write / output tiers from an **org-wide overrideable** rate table covering 40+ models (Anthropic, OpenAI, Google/Gemini, Meta Llama, Mistral, DeepSeek, Amazon Titan, Cohere, Ollama-served), emitting `effectiveCost` and `billableTokens`. Provider cache-accounting differences are normalized first; retrieval models (embeddings/rerank) are excluded from generation-quality ratios; and a model missing from the table costs a **blended rate** (mean of priced generation models), never $0, flagged with "≈".
- **Logical-error detection** — Catches HTTP-200 responses that are really failures (refusals, content filtering, max-token truncation, `gen_ai.error.*`) across Explorer, Pulse, and the SLA detectors.
- **Self-activating capability panels** — The app knows about far more attributes than it consumes (the full inventory lives in the companion **AI Attributes Audit** app). A single app-wide capability probe detects which of those attributes your telemetry actually emits, and a set of panels render *automatically* once their attribute appears — no code change, no redeploy. Coverage includes: prompt cache & reported cost, safety & guardrails, **retrieval / RAG** (gated on a dedicated vector-store `db.system` *value* such as `pinecone`/`qdrant` — **not** `db.system`-any, which would light up on ordinary databases — or `vector_db.*`), feedback & prompt versioning, **TTFT**, **evaluation / hallucination scores**, **session / user attribution**, **MCP**, and **memory / state stores**. The probe honors the scan-limit selector and distinguishes "absent" from "not seen within scan budget." A panel is free until its data exists, then lights up.
- **Show with example data** — A Tweaks toggle renders capability-gated panels with clearly-labeled example data when your telemetry doesn't emit the attribute, so you can see what you're missing (never mixed with real data).
- **Tweaks panel** — Per-user appearance and display controls: theme, density, tile style, 16 accent colors (incl. custom hex), chart style/curve/value-labels, color-blindness filters, and page-config switches: **Agent tools · definition** (Strict / Discovered — defaults to Discovered), **Agents TTFT column**, **Show with example data**, and **Model names** (raw vs normalized).
- **SLA configuration** — Per-user thresholds (P90, P99, error rate, cost/invocation, TTFT) that override the Intelligence baseline for agent health scoring, a degraded-trend panel against the rolling 7-day baseline, and an Intelligence-detector drawer with ready-to-copy DQL for runaway-latency, token-spike, logical-error-surge, **within-trace token growth, model fallback/mismatch, context-window truncation, provider rate-limit, TTFT degradation, and tool-output→token attribution** detectors.
- **Cross-app navigation** — `sendIntent` wiring launches Distributed Tracing (single-trace waterfall or filtered Explorer), Services, Problems, and Notebooks against the exact entity / trace / span / timeframe in context, with Notebook DQL fallbacks.
- **Per-user persisted settings** via `state:user-app-states` — scan limit, sampling ratio, timeframe, global filters, SLA thresholds, privacy mode, and Tweaks all survive reloads; model-pricing overrides persist org-wide via app-state.
- **Defensive number formatting** — Every formatter coerces `unknown` (DQL hands numeric fields back as strings) and falls back to an em-dash, so a stray value never blows up the UI.

## Architecture

```
ui/app/
├── pages/               Five feature tabs (Pulse, Explorer, Agents, Prompts,
│                        Models — "Models / FinOps"). Each page owns its
│                        queries.ts + hooks + panels. The folded Tools /
│                        Topology / McpHealth dirs now hold only the shared
│                        query/hook/renderer modules reused by Agents & Pulse.
├── scope/               Timeframe, segments, scan-limit, sampling, global
│                        filter + capability contexts + the useScopedDql
│                        wrapper that injects them all into every query.
├── layout/              GlobalFilterStrip / click-to-filter UI.
├── state/               usePersistedState — useState-shaped hook backed by
│                        @dynatrace-sdk/react-hooks user-app-state.
├── detection/           Provider/model normalization, framework detection,
│                        orchestration-node classifier, attribute-capability
│                        registry, DQL helpers.
├── pricing/             Model-pricing override panel + context (org-wide).
├── tweaks/              Appearance/display tweaks panel + colorblind filters.
├── data/                Pricing table + cache-aware cost model, format
│                        helpers, and ai-layer-patterns.ts (the 8-layer AI
│                        Application Architecture model behind the Pulse map).
├── components/          Shared UI: charts, FindingCard, FacetGroup,
│                        EmptyState/ErrorState, SLAConfig module, drawers.
├── lib/intents.ts       sendIntent wrappers for cross-app navigation.
└── theme/               Strato token bridges.
```

Queries live next to the page that owns them. Pure logic (pricing, scoring, classification, formatting) is split out and unit-tested.

## Instrumenting your AI app

The app reads spans your collectors already emit under the OpenTelemetry **GenAI semantic conventions** and the **OpenLLMetry** extensions. If you instrument with the [Traceloop OpenLLMetry SDK](https://github.com/traceloop/openllmetry), the [OpenTelemetry GenAI instrumentations](https://opentelemetry.io/docs/specs/semconv/gen-ai/), or one of the major framework auto-instrumentations (LangChain, LlamaIndex, OpenAI SDK, Anthropic SDK, Bedrock, Vertex), most of these attributes show up for free.

Where two attribute names exist for the same thing (the older OpenLLMetry name and the newer OTel name), the app coalesces both, so either form will populate the UI.

### Provider & model identity

| Attribute | Purpose in the app |
|---|---|
| `gen_ai.provider.name` *(preferred)* / `gen_ai.system` | Provider grouping (OpenAI, Anthropic, Bedrock, Vertex…). Bedrock is server-side unwrapped to its underlying vendor. |
| `gen_ai.request.model` | Requested model. Used for pricing lookup, fan-out analysis, and the Models tab. |
| `gen_ai.response.model` | Actual model that served the response. Surfaced alongside the request model when they differ. |

### Token usage

| Attribute | Purpose in the app |
|---|---|
| `gen_ai.usage.input_tokens` *(OTel)* / `gen_ai.usage.prompt_tokens` *(OpenLLMetry)* | Input tokens. Coalesced — emit either. |
| `gen_ai.usage.output_tokens` *(OTel)* / `gen_ai.usage.completion_tokens` *(OpenLLMetry)* | Output tokens. Coalesced — emit either. |
| `gen_ai.usage.total_tokens` *(optional)* | Used as a fallback if neither input nor output is set. |
| `gen_ai.usage.reasoning_tokens` *(optional)* | Surfaced for reasoning models. |

### Request parameters

| Attribute | Purpose in the app |
|---|---|
| `gen_ai.request.max_tokens` | Shown in the Prompts tab; used for budget-overrun detection. |
| `gen_ai.request.temperature` | Surfaced in prompt detail. |
| `gen_ai.request.top_p` | Surfaced in prompt detail. |
| `gen_ai.request.reasoning_effort` | Shown for reasoning models. |

### Operation & agent identity

| Attribute | Purpose in the app |
|---|---|
| `gen_ai.operation.name` | Classifies the span (`chat`, `embeddings`, `tool`, `agent`, `task`…). Drives the partitioning between substantive and orchestration work. |
| `gen_ai.agent.name` | Agent identity in the Agents tab and topology graph. |
| `gen_ai.agent.id` | Agent disambiguation when multiple agents share a name. |
| `gen_ai.tool.name` | Tool identity in the Agents tab's Tools sub-view; used for call-volume and reliability ranking. |

### Workflow / framework context (OpenLLMetry)

| Attribute | Purpose in the app |
|---|---|
| `traceloop.workflow.name` | Workflow/task name. The app also uses suffix-matching on `"*.mcp"` to identify MCP-only spans on the Pulse tab. |
| `traceloop.entity.name` | Entity within a workflow (chain, agent, tool). |
| `traceloop.span.kind` | One of `workflow` / `task` / `agent` / `tool` / `llm`. |
| `traceloop.association.properties.*` | Free-form context propagated across spans (user IDs, session IDs, tenant). |

### Prompt & completion content

| Attribute | Purpose in the app |
|---|---|
| `gen_ai.prompt.{n}.role` / `gen_ai.prompt.{n}.content` | Rendered in the Prompts tab. Suppressed when per-user **Privacy mode** is enabled. |
| `gen_ai.completion.{n}.role` / `gen_ai.completion.{n}.content` | Same — model responses rendered side-by-side with prompts. |

### Errors

| Attribute | Purpose in the app |
|---|---|
| `error` *(span status)* | Drives the error-rate columns on Agents, Tools, Models. |
| `exception.type` / `exception.message` | Surfaced in finding cards and the trace drawer. |

### Vector database (RAG)

| Attribute | Purpose in the app |
|---|---|
| `db.system` | Vector DB identity (Pinecone, Weaviate, pgvector…). |
| `db.vector.query.top_k` | Retrieval breadth. |
| `db.query.embeddings.*` | Embedding query metadata. |

### Reference

- **OpenLLMetry semantic conventions** (Traceloop) — the canonical source for the legacy `prompt_tokens` / `completion_tokens` naming and the `traceloop.*` framework attributes: <https://www.traceloop.com/docs/openllmetry/contributing/semantic-conventions>
- **OpenTelemetry GenAI semantic conventions** — the upstream spec for `gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.agent.*`, `gen_ai.tool.*`, and the newer `input_tokens` / `output_tokens` naming: <https://opentelemetry.io/docs/specs/semconv/gen-ai/>

## Requirements

- A Dynatrace tenant on AppEngine with **Grail** enabled.
- Spans following the OpenTelemetry **GenAI semantic conventions** (`gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.agent.name`, `gen_ai.operation.name`, etc.).
- Node 16.13+ for local development.
- The following OAuth scopes (already declared in `app.config.json`):

  | Scope | Purpose |
  |---|---|
  | `storage:logs:read` | Guardrail and error detection from logs |
  | `storage:metrics:read` | Pulse reliability score, forecasting |
  | `storage:spans:read` | Agent / tool / model / prompt analysis |
  | `storage:bizevents:read` | Evaluation scores |
  | `storage:events:read` | Davis problems for the reliability score |
  | `storage:entities:read` | Resolve service entity IDs and names |
  | `storage:lookups:read` | CMDB lookups for scope resolution |
  | `storage:buckets:read` | Grail bucket-level access |
  | `davis:analyzers:execute` | Token-usage forecasting analyzer |
  | `app-settings:objects:read` / `write` | Per-user settings persistence |
  | `state:user-app-states:read` / `write` | Per-user UI state (scan limit, SLA, privacy mode) |

## Installation

```bash
git clone https://github.com/dberanjr/AIObservability3.0.git
cd AIObservability3.0
npm install
```

The repo ships with a **placeholder** tenant (`https://your-tenant.apps.dynatrace.com/`) — you must point the app at your own tenant before deploying by editing `environmentUrl` in `app.config.json`:

```json
{
  "environmentUrl": "https://<your-tenant>.apps.dynatrace.com/"
}
```

`dt-app deploy` will fail against the placeholder, so a real tenant is required. Keep your tenant URL local — don't commit it back, so the repo's `environmentUrl` stays a placeholder.

## Available scripts

| Command | What it does |
|---|---|
| `npm run start` | Launches the dt-app dev server and opens the app in a browser |
| `npm run build` | Builds the production bundle to `dist/` |
| `npm run deploy` | Builds and deploys to the tenant in `app.config.json` (bump `version` first) |
| `npm run uninstall` | Removes the app from the configured tenant |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` over the `ui/` tree |
| `npm run lint` | ESLint over the whole repo |
| `npm run info` | Prints dt-app CLI and environment info |

> **Note:** Dynatrace rejects deploys when the version on disk matches an installed version with a different checksum. Bump `app.version` in `app.config.json` for every deploy.

## Configuration

User-configurable settings live in the app UI itself — there is nothing to set up in environment files:

- **Timeframe** — Header selector that sets the analysis window for every tab; preserved across navigation.
- **Scan limit** — Toolbar toggle (500 GB / 1 TB / 2 TB / 5 TB) injected into every DQL via `useScopedDql`.
- **Sampling** — Optional query-time sampling ratio for cheaper exploration over large datasets.
- **Model pricing** — Override built-in per-model rates from the toolbar pricing panel.
- **Segments** — Optional. Use tenant-defined filter segments to slice activity by teams, deployments, environments, services, or custom dimensions. Empty selection queries the whole fleet.
- **SLA thresholds** — Editable through the SLA config drawer; persisted per user.
- **Privacy mode** — Suppresses prompt/response content rendering on the Prompts tab.

All persisted via `@dynatrace-sdk/react-hooks` `useUserAppState` / `useSetUserAppState` behind a `useState`-shaped wrapper (`ui/app/state/usePersistedState.ts`).

## Testing

Pure functions — pricing, classification, attribute normalization, agent health scoring, FinOps scoring — are covered by Vitest. Run `npm test` for a single pass or `npm run test:watch` while developing.

Current coverage: 403 tests across 31 files spanning detection, the attribute-capability registry + enrichment-tier gating, the cache-aware cost model (cache tiers, provider accounting, blended fallback), the AI-layer model + use-case-lens drift guards, the within-trace token-growth detector, the high-frequency-tool predicate, scan-limit injection, the **hybrid global filter** (direct per-span injection + the cross-span trace-scope resolver, including the **250-sub-expressions-per-expression cap safety** so a large trace set can't overflow DQL), the **Prompts focus presets** (every same-span predicate + cross-span trace resolver) and the **server-side agent join + status-tile content relaxation**, **trace-topology cycle safety** (recursive agent/MCP traces collapse to cyclic node graphs — the layout must not loop), SLA scoring, and FinOps comparison scoring.

## Tech stack

- **React 18** + **TypeScript 5** + **React Router 6**
- **Dynatrace Strato Design System** (`@dynatrace/strato-components`, `-preview`, `-icons`, `-design-tokens`)
- **Dynatrace SDK** — `@dynatrace-sdk/react-hooks` (DQL + user state), `@dynatrace-sdk/navigation` (sendIntent), `@dynatrace-sdk/app-environment`
- **dt-app CLI** 1.9 for build / dev server / deploy
- **Vitest 4** for unit tests

## Contributing

Issues and PRs welcome. Before opening a PR:

1. `npm test` — green
2. `npm run typecheck` — green
3. `npm run lint` — green
4. For any new DQL, confirm field names against the [Dynatrace Semantic Dictionary](https://docs.dynatrace.com/docs/semantic-dictionary) and functions against the [DQL reference](https://docs.dynatrace.com/docs/shortlink/dql-dynatrace-query-language-hub).

## License

MIT — see [LICENSE](./LICENSE).

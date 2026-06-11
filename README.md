# AI Observability 3.0

End-to-end observability for agentic AI workloads, built as a native Dynatrace AppEngine app.

AI Observability 3.0 turns OpenTelemetry GenAI spans collected in Dynatrace Grail into an opinionated control plane for agents, tools, models, prompts, and spend. It works against the entire fleet by default and supports Dynatrace Segments to slice activity by logical filters (teams, services, deployments, environments).

---

## What it does

Modern AI applications fan out across orchestrators, agents, tools, RAG pipelines, and a half-dozen model providers. The data is in Grail thanks to the OpenTelemetry GenAI semantic conventions, but the questions teams actually need to answer — *which agent is regressing? which model is the most expensive per useful answer? where is latency coming from?* — require a UI that understands the shape of agentic systems.

That's what this app provides: ten purpose-built tabs that read the same `gen_ai.*` spans your collectors already emit, normalize provider/model identity (including Bedrock vendor unwrapping), price every request, and surface findings you can pivot from directly into Traces, Services, and Problems.

## Features

Ten purpose-built tabs, each reading the same `gen_ai.*` spans and sharing one global scope (timeframe + segments + filters). Every chart can be expanded to a modal, most values are click-to-filter, and each tab degrades gracefully with a data-gap note when an attribute your telemetry doesn't emit yet would otherwise power a panel.

### Pulse — fleet health & efficiency

One-screen health and efficiency dashboard for the whole AI footprint.

- **Summary tiles** — Tokens, Spend (blended estimate), P95 latency, Error rate, Models, MCP servers, MCP tools, Cost / request, and Token efficiency. Each tile carries a sparkline or donut glyph and expands to a modal with a full-size chart, a stats grid (total / avg / min / max / resolution), and sortable breakdown tables (model / server / tool, with latency percentiles, error and cost columns).
- **Token-efficiency panel** — A composite **Token efficiency score** (output leverage 50% · completion/truncation 30% · throughput 20%) and an **Output-per-dollar** tile, each with the drivers behind the number.
- **Platform health card** — Three scored pillars (Operational, Quality, Cost) with status, reasons, and an expandable "what's contributing" view (slowest agents, slowest models, highest-error agents).
- **Latency-tier breakdown** — Stacked share of wall-clock time across LLM / Retrieval-DB / Tool / Orchestration, with per-tier span counts and avg/P95.
- **Token-consumption chart** — Tokens vs. estimated cost over time with a **Dynatrace Intelligence forecast** overlay (confidence bands) and timeline brush-zoom that emits ISO timestamps for a reproducible window.
- **Top Findings strip** — Up to five threshold-detected findings ("Dynatrace Intelligence"), each opening a finding drawer with drill-out intents.
- **Activity histogram** (24h request distribution with peak/quiet/avg), **Top models** bar list, **per-agent cost** bar list, and a **provider-mix** donut (Bedrock-proxied vendors unwrapped).

### Explorer — AI-service discovery

Service-centric browser over all AI activity.

- **Summary tiles** — AI services, LLM requests, Tokens, Active models, Concentration (top-service share), Errors, and **Logical errors** (HTTP-200 responses that are really failures — refusals, content filtering, max-token truncation).
- **Faceted sidebar** — Search plus provider / framework / model facets (each with counts), wired to URL params for shareable views.
- **AI services table** — Status dot (by error rate), service, framework badge, model chips (provider-colored), LLM requests, tokens, tokens/request, agent count, errors, and logical errors; rows open a finding drawer with drill-outs.
- **Service × Model heatmap** — Token volume per service/model cell (log-scaled), hoverable and click-to-filter.

### Agents — per-agent performance, cost & quality

- **View / operation slicers** — All / Slow (P90 > 2s) / Expensive / Most-used, crossed with Chat / Completion / Embeddings.
- **Substantive vs. orchestration partitioning** — Framework internals (LangGraph/Runnable nodes, output parsers, prompt templates, and zero-LLM/zero-tool sub-200ms steps) are split out of the headline agent counts into a collapsible **Orchestration** section.
- **Agents table** — Invocations, P90, P99, optional TTFT, error %, cost/invocation, and a mini **stage-breakdown bar** (LLM / Tool / Retrieval / Orchestration). Rows expand to stage mix, latency percentiles (P50/P90/P99/avg), and a cost breakdown; an SLA-health column appears when custom thresholds are configured.
- **Evaluation banner** — Tool-call correctness, hallucination rate, task-success rate, and avg context tokens from `gen_ai.evaluation.*` (with a preview mode and setup guide when absent).
- **Degradation-trend panel** — Top slow agents vs. their rolling 7-day Intelligence baseline.
- **Agent-loop detection** — Flags LangGraph runs that revisit nodes (≥2× avg) or run deep (≥20 steps), with loop-rate, max-revisits, and max-steps per agent.
- **Upstream services** (from Smartscape topology), plus **SLA-config** and **Intelligence-detector** setup drawers.

### Tools — tool-call analytics

- **Latency × volume bubble chart** — X = call volume (log), Y = P90 latency (log), bubble size = P90, color = category (Search / Database / HTTP / File / Compute / MCP / Other). Four clickable quadrants: Bottleneck, Hot-spot, Quiet, Healthy.
- **Side panels** — Top retry-rate tools and slowest-by-P99, both click-to-filter.
- **Calls-by-category** bar chart and an **all-tools table** (calls, avg/P90/P99, error %, retry %, calling agents) with sortable columns and click-to-filter on tool/service.
- **Compute toggle** — Include/exclude high-volume compute spans (predict/generate/graph) that would otherwise flatten the chart.
- **Detail modal** — Overview (stats + call-volume vs. latency chart), Traces (sample waterfalls, open in Distributed Tracing), Topology (owning service + calling agents), and Info tabs.
- **Tool-definition mode** — Switch between *Strict* (`gen_ai.tool.name` only) and *Discovered* (also internal function / MCP spans by `span.name`) in the Tweaks panel.

### Prompts — message-level inspection

The richest tab: a searchable record of every LLM/agent interaction.

- **Stream / Metadata / Evaluations views** with a wide, column-selectable table — time, AI app, model, type, temperature (color-banded), duration, in/out tokens, in/out cost, prompt/response text, system prompt, trace ID. Rows are tinted for errors and for max-token **truncation**.
- **Percentile anomaly highlighting** — Duration, tokens, and cost cells flag amber at P90 and red at P98 (computed when ≥5 samples exist).
- **Sticky filter sidebar** — Search, type/service/model/agent/provider/operation facets, status toggles (errored / PII detected / warnings / truncated), and range controls for response time, temperature, and in/out cost.
- **Privacy mode** — Per-user "Mask PII / Show raw" toggle that suppresses prompt and response content in both the table and the detail panel.
- **Detail panel** with sub-tabs: **Prompts** (full content bubbles, copy / copy-all / maximize, PII banner), **Trace** (in-app span waterfall with type indicators, search, and a span-attributes panel; open span/trace/user-session in the platform apps), **Logs** (trace logs by severity), **Topology** (per-trace dependency graph), **Eval** (score cards), and **Info** (IDs, tokens, cost, log counts).

### Topology — aggregate dependency graph

- **Full-screen force/vertical/horizontal graph** of the AI dependency mesh — nodes are LLM / model / provider / tool / vector-DB (size = call volume, color = tier), edges are call flows (width/opacity = volume).
- **Connected highlighting & isolation** — Select a node to highlight its upstream/downstream path or isolate it to direct neighbors only.
- **Error & problem rings** — Amber/red rings by error rate; a red dashed ring marks nodes with active Davis problems.
- **Controls** — Node search, per-tier show/hide toggles, zoom/pan, reset view, **export-to-PNG**, and a **resizable canvas**.

### MCP Health — Model Context Protocol servers & tools

- **KPI cards** — MCP requests, Tool calls, Error rate, Tool types, and server **p95 / p99** latency (color-thresholded).
- **Threshold-driven alert band** — Per-tool statuses (Error / Latency / Slow / Tail / Healthy), sorted by severity, or a single green "all healthy" row.
- **Activity chart** — Dual-axis MCP requests vs. errors per bucket (sampling-extrapolated).
- **Tool-health table** — Calls, error %, P50, P95, and a status pill, sortable and click-to-filter. Reads `traceloop.span.kind = tool` spans plus OTel MCP conventions, with an instrumentation note for what richer `mcp.*` attributes would add.

### AI Attribute Audit — telemetry coverage

- **Overall coverage ring** plus hero stats: attributes present (X/Y), categories complete (X/10), categories with gaps, and (sampling-extrapolated) span activity.
- **Live table-of-contents** that jumps to and expands any section.
- **Ten sections across six groups** — Core (LLM/inference `gen_ai.*`), Orchestration (Agent, Traceloop workflow, LangGraph), Tools (`gen_ai.tool.*`, MCP `mcp.*`), Retrieval (vector DB), Quality (evaluation & quality, session & user), and Platform (infrastructure/platform context).
- **Per-attribute detail** — Present/Missing verdict, "what it buys you" one-liner, coverage bar with span count, and a detail modal; each section links to the canonical OTel / OpenLLMetry specs. A caveat explains that heavy sampling can produce false "missing" readings.

### Models — model comparison

- **Type filter** — All / Generative / Embedding / Reranking.
- **Bubble chart** — X = total tokens (log), Y = avg latency (log), size = request volume, color = provider.
- **Side panels** — Top spenders (cost leaders) and provider mix; plus a sortable table with request volume, in/out tokens, context utilization, throughput (tok/s), avg/P95/P99 latency, error and timeout rates, cost, and $/1M tokens.

### FinOps — cost attribution & forecasting

- **Spend tiles** — 24h, 7d, projected 30d, concentration (top-service share), blended $/1M tokens, and possible savings from $/MTok outliers.
- **Daily cost** stacked bar (top models + "Other") and a **cost-concentration treemap** by service.
- **Model A/B comparison** — Pick a use-case profile (RAG Q&A, interactive chat, classification, batch, internal tool, critical policy) and two models; a five-dimension weighted score (latency, cost/request, quality, throughput, reliability) yields a verdict and an estimated monthly saving.
- **Cost efficiency by service** — $/1M-token ranking that surfaces the first FinOps wins.

## Cross-cutting capabilities

- **Fleet-wide by default** — Opens against your entire AI footprint; **Dynatrace Segments** (with variables) slice it down to any logical subset (teams, services, environments, deployments).
- **Global timeframe** — Header selector (30m / 1h / 6h / 24h / 7d / 14d / 30d, default 1h) that persists per user and travels across tab navigation and shareable URLs.
- **Global attribute filter & click-to-filter** — Click almost any value (model, agent, provider, service, tool, trace/span ID, k8s attribute…) to add it as an app-wide filter; high-cardinality keys (IDs) use debounced, on-demand server-side value discovery instead of pre-fetching.
- **Scan-limit toggle** — 500 GB / 1 TB / 2 TB / 5 TB query budget for the whole app; every hook routes through `useScopedDql`, which rewrites `scanLimitGBytes` (and injects segments + global filters) into the active query.
- **Sampling control** — Optional query-time sampling ratio (None / 10 / 100 / 1k / 10k); count and sum aggregates are transparently extrapolated, while sampling-invariant metrics (percentiles, averages, error rates, distinct counts) are left untouched.
- **Server-side provider & model normalization** — Bedrock invocations are unwrapped to their underlying vendor (Anthropic, Meta, Cohere, Mistral…) directly in DQL, and model identifiers are canonicalized (region/vendor prefixes, dates, and revisions stripped) so charts reflect the real model, not the gateway.
- **Built-in pricing for 22 models** (Anthropic, OpenAI, Google, plus Bedrock-hosted Amazon Titan and Cohere) with **org-wide overrideable rates** via the toolbar Model-Pricing panel; retrieval models (embeddings/rerank) are detected and excluded from generation-quality ratios.
- **Logical-error detection** — Catches HTTP-200 responses that are really failures (refusals, content filtering, max-token truncation, `gen_ai.error.*`) across Explorer, Pulse, and the SLA detectors.
- **Tweaks panel** — Per-user appearance and display controls: theme, density (comfortable / compact / minimal), tile style, 16 accent colors (incl. custom hex), chart style/curve/value-labels, color-blindness filters (protanopia / deuteranopia / tritanopia / achromatopsia), and page-config switches (Tools definition mode, Agents TTFT column).
- **SLA configuration** — Per-user thresholds (P90, P99, error rate, cost/invocation, TTFT) that override the Intelligence baseline for agent health scoring, a degraded-trend panel against the rolling 7-day baseline, and an Intelligence-detector drawer with ready-to-copy DQL for runaway-latency, token-spike, and logical-error-surge detectors.
- **Cross-app navigation** — `sendIntent` wiring launches Distributed Tracing (single-trace waterfall or filtered Explorer), Services, Problems, and Notebooks against the exact entity / trace / span / timeframe in context, with Notebook DQL fallbacks.
- **Per-user persisted settings** via `state:user-app-states` — scan limit, sampling ratio, timeframe, global filters, SLA thresholds, privacy mode, and Tweaks all survive reloads; model-pricing overrides persist org-wide via app-state.
- **Defensive number formatting** — Every formatter coerces `unknown` (DQL hands numeric fields back as strings) and falls back to an em-dash, so a stray value never blows up the UI.

## Architecture

```
ui/app/
├── pages/               Ten feature tabs (Pulse, Explorer, Agents, Tools,
│                        Prompts, Topology, McpHealth, AttributeAudit, Models,
│                        FinOps). Each page owns its queries.ts + hooks + panels.
├── scope/               Timeframe, segments, scan-limit, sampling, global
│                        filter contexts + the useScopedDql wrapper that
│                        injects them all into every query.
├── layout/              GlobalFilterStrip / click-to-filter UI.
├── state/               usePersistedState — useState-shaped hook backed by
│                        @dynatrace-sdk/react-hooks user-app-state.
├── detection/           Provider/model normalization, framework detection,
│                        orchestration-node classifier, DQL helpers.
├── pricing/             Model-pricing override panel + context (org-wide).
├── tweaks/              Appearance/display tweaks panel + colorblind filters.
├── data/                Pricing table, cost estimator, format helpers.
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
| `gen_ai.tool.name` | Tool identity in the Tools tab; used for call-volume and reliability ranking. |

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

Point the app at your tenant by editing `environmentUrl` in `app.config.json`:

```json
{
  "environmentUrl": "https://<your-tenant>.apps.dynatrace.com/"
}
```

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

Current coverage: 91 tests across 6 files spanning detection, pricing, SLA scoring, and FinOps scoring modules.

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

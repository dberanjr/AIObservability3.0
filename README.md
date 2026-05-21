# AI Observability 3.0

End-to-end observability for agentic AI workloads, built as a native Dynatrace AppEngine app.

AI Observability 3.0 turns OpenTelemetry GenAI spans collected in Dynatrace Grail into an opinionated control plane for agents, tools, models, prompts, and spend. It works against the entire fleet by default and supports Dynatrace Segments to slice activity by logical filters (teams, services, deployments, environments).

---

## What it does

Modern AI applications fan out across orchestrators, agents, tools, RAG pipelines, and a half-dozen model providers. The data is in Grail thanks to the OpenTelemetry GenAI semantic conventions, but the questions teams actually need to answer — *which agent is regressing? which model is the most expensive per useful answer? where is latency coming from?* — require a UI that understands the shape of agentic systems.

That's what this app provides: eight purpose-built tabs that read the same `gen_ai.*` spans your collectors already emit, normalize provider/model identity (including Bedrock vendor unwrapping), price every request, and surface findings you can pivot from directly into Traces, Services, and Problems.

## Features

### Eight purpose-built tabs

- **Pulse** — One-screen health view: platform reliability score, summary tiles, anomaly strip, top issues, token-consumption trend with forecast, activity histogram, per-agent cost bar list, top models, and provider mix.
- **Explorer** — Faceted browser over all AI service activity: filter by provider, model, framework, agent, and tool; drill into any record.
- **Agents** — Per-agent table with substantive vs. orchestration partitioning, model fan-out, p50/p90/p99 latency, error rate, TTFT, blended cost, and a stage breakdown (LLM / tool / orchestration / wait).
- **Tools** — Tool-call analytics with a bubble-chart view (call volume × latency × error rate) and a side panel of slowest/most-failing tools.
- **Prompts** — Prompt-pattern surface for inspecting the actual messages flowing through the system (respects per-user privacy mode).
- **Topology** — Service-to-service / agent-to-tool graph derived from span parent/child relationships.
- **Models** — Bubble chart comparing models by request volume, latency, and error rate; side panels for cost leaders and reliability leaders.
- **FinOps** — Cost attribution and forecasting with a configurable scoring model.

### Cross-cutting capabilities

- **Fleet-wide by default** — Opens against your entire AI footprint. Use Segments to filter down to any logical subset (teams, services, environments, deployments).
- **Server-side provider normalization** — Bedrock invocations are unwrapped to their underlying vendor (Anthropic, Meta, etc.) directly in DQL, so charts reflect the real model, not the gateway.
- **Built-in pricing for 11 models** with overrideable per-model rates.
- **Scan-limit toggle** — Switch between 500 GB / 1 TB / 2 TB / 5 TB query budgets for the whole app from a single control. Every hook routes through `useScopedDql`, which rewrites `scanLimitGBytes` in the active query.
- **Per-user persisted settings** via `state:user-app-states` — scan limit, SLA thresholds, privacy mode survive reloads.
- **SLA configuration** module with overrideable defaults, a degraded-trend panel, and an Intelligence detector drawer.
- **Finding drawer** with `sendIntent` wiring to launch Traces, Services, Notebooks, and Problems against the relevant context.
- **Defensive number formatting** — every formatter accepts `unknown` and coerces, so a DQL value arriving as a string never blows up the UI.

## Architecture

```
ui/app/
├── pages/               Eight feature tabs (Pulse, Explorer, Agents, Tools,
│                        Prompts, Topology, Models, FinOps). Each page owns
│                        its queries.ts + hooks + panel components.
├── scope/               Segments filter resolution, scan-limit injection,
│                        useScopedDql wrapper.
├── state/               usePersistedState — useState-shaped hook backed by
│                        @dynatrace-sdk/react-hooks user-app-state.
├── detection/           Provider/model normalization, framework detection,
│                        orchestration-node classifier, DQL helpers.
├── data/                Pricing lookup, cost estimator, format helpers.
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

- **Scan limit** — Toolbar toggle (500 GB / 1 TB / 2 TB / 5 TB) injected into every DQL via `useScopedDql`.
- **Segments** — Optional. Use tenant-defined filter segments to slice activity by teams, deployments, environments, services, or custom dimensions. Empty selection queries the whole fleet.
- **SLA thresholds** — Editable through the SLA config drawer; persisted per user.
- **Privacy mode** — Suppresses prompt/response content rendering on the Prompts tab.

All persisted via `@dynatrace-sdk/react-hooks` `useUserAppState` / `useSetUserAppState` behind a `useState`-shaped wrapper (`ui/app/state/usePersistedState.ts`).

## Testing

Pure functions — pricing, classification, attribute normalization, agent health scoring, FinOps scoring — are covered by Vitest. Run `npm test` for a single pass or `npm run test:watch` while developing.

Current coverage: 82 tests across detection, pricing, SLA scoring, and FinOps scoring modules.

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

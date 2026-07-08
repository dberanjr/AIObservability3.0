# AI Observability 3.0 — A Guide for AI Application Owners

You built an agentic AI application — agents that reason, call tools and MCP servers,
retrieve from vector stores, and invoke LLMs across one or more providers. This app
tells you whether it's **working, fast, reliable, correct, and affordable** — without
asking you to tag or annotate anything.

It reads the OpenTelemetry GenAI / Traceloop / MCP spans your app already emits (collected
in Dynatrace Grail) and turns them into an opinionated control plane. It works fleet-wide
by default; narrow to a team, service, or environment with Dynatrace Segments.

---

## The questions it answers

As an app owner, you usually arrive with one of these questions. Here's where to go.

| Your question | Where | What you get |
|---|---|---|
| *What AI is even running, and how is it wired?* | **Pulse**, **Explorer** | A live architecture map (client → gateway → orchestrator → agent → tools / LLM / vector DB / memory), split by framework (LangGraph, LangChain, …), and a catalog of every AI service, model, and provider. |
| *What is it costing me — and where is it heading?* | **Explorer**, **Models / FinOps** | Per service×model cost shown three ways — **observed**, **sampling-extrapolated**, and **monthly run-rate** — with per-million token pricing, cost/request, and where spend concentrates. |
| *Is it reliable? What's failing and why?* | **Pulse**, **Explorer**, **Prompts** | Hard errors **and** "logical" failures (guardrail blocks, refusals, content filters, truncation, validation errors) — flagged on the architecture map and inside individual traces. |
| *What's slow, and which part?* | **Agents**, **Pulse** | Latency p50/p90/p95, time-to-first-token, and a per-tier breakdown (LLM vs tool vs retrieval vs orchestration). |
| *Are my agents behaving correctly?* | **Agents** | Per-agent health, framework attribution, **runaway-loop detection**, tool/MCP usage, and evaluation scores (correctness, hallucination, task success). |
| *What exactly happened in this one request?* | **Prompts** | The full distributed-trace waterfall + topology for a single agent run — the call tree, where it errored, tokens per step, prompts/responses. |
| *Am I instrumented well enough?* | **Attributes** | An audit of which GenAI/Traceloop/MCP attributes are present vs missing, ranked Mandatory / Important / Nice-to-have / Other, with guidance on what to add. |

---

## A tour by goal

### Pulse — "is my AI app healthy right now?"
The **AI Application Architecture** map shows the layers of your agentic stack and the live
flow between them, color-weighted by volume and health. The orchestrator tier breaks out the
**frameworks** actually in use (e.g. LangGraph, LangChain), and a reasoning-loop indicator
flags runaway agent loops. Start here for an at-a-glance read and to see where errors or
latency concentrate.

### Explorer — "what's running, and what does it cost?"
A catalog of every **AI service × model** combination, with usage, errors, and concentration.
Click any service+model cell for a detail popup: **cost** (observed / full-population estimate /
monthly run-rate), the model's **pricing** (input & output $/M tokens, context window, provider,
tier), and **golden signals** (requests, error rate, latency p50/p90/p95, tokens/request). The
top tiles and grid are clickable to filter the whole page down to what you care about.

### Agents — "are my agents performing and behaving?"
Per-agent view: which **orchestration framework** each uses, throughput, latency (incl. TTFT),
a **latency decomposition** across LLM/tool/retrieval/orchestration, tool & MCP usage, loop rate,
and **evaluation scores**. Expand an agent to see a trace-level topology of one representative run.

### Prompts — "debug this specific execution"
Browse prompts/requests and open the **full distributed trace** for any one — a waterfall and a
node-link topology covering the complete call tree (agent → LLM → tools → memory, including the
underlying infrastructure calls). Errored spans are flagged in red and propagate a warning up to
their parents; each span shows input/output tokens and a full attribute panel (including LangGraph
node/checkpoint details). This is your end-to-end root-cause view for a single run.

### Models / FinOps — "manage spend and rates"
Model pricing and spend, with editable rates so cost figures match your actual contracts.

### Attributes — "is my telemetry good enough?"
An instrumentation audit: for each category (LLM/inference, Agent, Tool calls, Traceloop workflow,
LangGraph, MCP, Evaluation, Session/user, Vector DB, Infrastructure) it tests whether the expected
attributes are present on live spans and ranks them **M**andatory / **I**mportant / **N**ice-to-have /
**O**ther. It also surfaces community/emerging attributes you might adopt. Use it to know what to
instrument next so the rest of the app gets richer.

---

## How to drive it

- **Time & scope (top bar):** pick a timeframe; use **Segments** to scope to a team/service/environment.
- **Sampling & scan limit:** trade fidelity vs cost of the underlying queries. For a definitive read
  on a rare attribute, set sampling to *None* or widen the timeframe.
- **Filter, everywhere:** click a model, service, agent, or tool anywhere to filter the whole app to it
  — the active filter shows as a removable chip at the top.
  - Filtering by **model** or **service** is exact and uncapped.
  - Filtering by **agent** or **tool** scopes to the *traces* those ran in (so you can pivot from
    "this agent" to its prompts, cost, and errors), capped for very high-volume cases.
- **Reset / Reload:** **Reset** clears all filters (global + page) and timeframe; **Reload** refetches
  current data without changing your filters.

---

## For specific roles

### For SREs / on-call — keep it reliable and fast
You own uptime, latency, and error budgets for the AI app. This tool is your AI-aware
companion to the usual signals.

- **Triage from the top down.** Start at **Pulse** to see which tier is unhealthy (agent,
  LLM, tools, retrieval, memory) and where errors/latency concentrate. The map flags problem
  tiers and runaway reasoning loops.
- **Don't miss "silent" failures.** AI apps frequently return **HTTP 200 with a failed payload** —
  guardrail blocks, refusals, content-filter trips, validation errors, context truncation. The app
  separates these **logical errors** from hard errors so they don't hide in your success rate.
- **Latency, decomposed.** p50/p90/p95 and **time-to-first-token** per agent, with a breakdown of
  where the time goes — model vs tool vs vector retrieval vs orchestration — so you fix the right layer.
- **Root-cause one request.** From an alert, filter to the offending agent/service, open **Prompts**,
  and walk the **full distributed trace**: the call tree, the exact errored span (flagged red, propagated
  to parents), token usage, and the prompt/response that triggered it.
- **Catch runaway agents.** Loop detection surfaces agents stuck re-invoking the LLM — a common cause
  of latency and cost spikes.
- **Scope to the incident.** Use Segments + timeframe + the filter chips to isolate the affected service,
  model, or agent; **Reset/Reload** to clear or refresh.
- **Coverage caveat:** under heavy sampling a rare-but-real failure can read as "missing" — set sampling
  to *None* (or widen the window) for a definitive verdict, and check **Attributes** if a signal you
  expected isn't present.

### For FinOps / cost owners — control and forecast spend
You own the AI bill and want attribution, forecasting, and optimization levers.

- **Attribute cost precisely.** **Explorer** breaks spend down by **service × model**; the detail popup
  shows cost three ways: **observed** (what was actually sampled), **full-population estimate** (scaled up
  for sampling), and **monthly run-rate** (projected forward). It also shows the model's input/output
  $/M-token rates, context window, and tier.
- **Make the numbers match your contract.** In **Models / FinOps** you can edit per-model rates
  (org-wide) so every cost figure reflects your actual pricing, not list price. A "blended/estimated"
  badge appears when a rate is a fallback.
- **Find the cost drivers.** Sort/scan by tokens and cost; the **Concentration** signal highlights when a
  single service dominates. **Tokens/request** and **token efficiency** (output ÷ total) expose wasteful
  prompts and over-long contexts; **truncation** flags context-window pressure.
- **Chargeback / showback.** Use Dynatrace **Segments** to slice spend by team, environment, or
  deployment for attribution across the org.
- **Forecast & budget.** The monthly run-rate per service+model gives a forward-looking number for
  budgeting and for spotting a model swap or traffic change before the invoice does.
- **Optimization candidates.** High cost + high latency on a frontier model, low token efficiency, or
  heavy truncation are the signals that point to model right-sizing, prompt trimming, or caching.

## What it depends on (and good to know)

- It relies on your app emitting **OpenTelemetry GenAI semantic-convention** spans (plus Traceloop /
  MCP / LangGraph attributes where applicable). The **Attributes** tab tells you how complete that is —
  the better instrumented your app, the more of this app lights up.
- An "agent" is detected as a distinct `gen_ai.agent.name`; an "AI service" is any service emitting
  LLM spans (`gen_ai.provider.name`). Frameworks are *inferred* from span signals — best-effort, since
  most stacks don't emit an explicit framework tag.
- Nothing here requires manual tagging or app code changes; it reads what's already in Grail.

---

*Built as a native Dynatrace AppEngine app. For build/architecture details aimed at developers, see the
root `README.md`.*

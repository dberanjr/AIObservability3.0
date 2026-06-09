# AI Observability — Instrumentation Requirements for United's AI Team

**Audience:** United Airlines AI application / platform team
**Author:** Solution engineering (AI Observability 3.0 App)
**Tenant validated:** `ualpre` (united nonprod), via Grail DQL over a 24h–7d window
**Purpose:** A prioritized list of span attributes and trace-context fixes the AI workload should emit so the AI Observability 3.0 App (and any best-of-breed AI observability) can answer cost, performance, quality, reliability, agent-behavior, RAG, governance, and adoption questions.

> The app's **AI Attribute Audit** tab is the live version of this document — it shows, per attribute, present (green) / missing (red) against your real spans. This doc adds *priority*, *why*, and *best practice*.

---

## How to read priority

| Tier | Meaning |
|---|---|
| **P0** | Foundational. Blocks multiple whole capability areas. Do first. |
| **P1** | High value. Unlocks a major capability area. |
| **P2** | Valuable. Completes or sharpens an area. |

Effort is for the **instrumentation** side (United), not the app.

---

## P0 — Foundational

### P0.1 Trace-context propagation across the LLM proxy  *(single highest-leverage fix)*
- **Observed:** Of 342,687 traces, only **259** contain both an agent span and the LLM/token spans it triggered. 189,460 traces are agent-only; 152,968 are LLM-only. `gen_ai.agent.name` appears on **0** LLM spans.
- **Root cause:** LLM calls run through a central proxy (`bos-proxy-core`) that starts a **new trace** instead of continuing the caller's trace, so the W3C `traceparent` context is not propagated end to end.
- **Unblocks:** end-to-end agentic traces (user → agent → tool → LLM → action), **per-agent / per-session cost**, latency decomposition that includes the LLM tier, logical-error attribution to the right agent, RAG-to-answer linkage.
- **Best practice:** Propagate W3C `traceparent`/`tracestate` from the agent through the proxy to the provider call (OpenTelemetry context propagation). Ensure the proxy is a *child span in the same trace*, not a new root. Also stamp `gen_ai.agent.name` (and `gen_ai.conversation.id`, below) onto the LLM spans where feasible as a fallback correlation key.
- **Ref:** OpenTelemetry context propagation; GenAI spans conventions.

### P0.2 Proxy-span resilience: non-null IDs + Bedrock/boto3 coverage
- **Observed:** Many proxy/LLM spans carry no agent identity; Bedrock (`amazon.*`, `us.anthropic.*`, `global.anthropic.*`, `cohere.*`) traffic via boto3 is present but under-attributed.
- **Best practice:** Guarantee non-null `trace.id`/`span.id`/`parent.span.id` on proxy spans; add an instrumentation shim for the boto3 Bedrock path (`InvokeModel`/`Converse`) so it emits the same `gen_ai.*` set as the direct SDKs.

---

## P1 — High value (one per capability area)

### P1.1 Session / user / conversation identity  → cost-per-session, audit, adoption
- **Missing:** `session.id` (0), `gen_ai.conversation.id` (0), `gen_ai.user` (0), `dt.rum.session.id` (0).
- **Unblocks:** cost & quality per session/user/team, multi-turn conversation reconstruction, "who used which model" audit trail, adoption funnels (where users abandon mid-flow), front-end-to-back-end linkage.
- **Best practice:** Emit a stable `gen_ai.conversation.id` per dialogue and `session.id` per app session across every turn and backend hop; set `gen_ai.user` (hashed/pseudonymous is fine); inject `dt.rum.session.id` from the browser into backend requests.

### P1.2 Evaluation / quality scores  → the entire Quality pillar
- **Missing:** all `gen_ai.evaluation.*` (0) — faithfulness, hallucination, correctness, relevance, composite score.
- **Unblocks:** quality dashboards & SLOs, drift detection after a prompt/model change, A/B quality across model versions, "cheapest model that still meets quality SLO."
- **Best practice:** Run an eval step (LLM-as-judge, Ragas/DeepEval, or in-house) and write results back onto the span as `gen_ai.evaluation.<metric>` (0–1 scores) plus `gen_ai.evaluation.result`. Sample continuously in prod, not just offline.

### P1.3 Tool & MCP semantic attributes  → tool/MCP observability
- **Missing:** `gen_ai.tool.*` (0), `mcp.*` (0). Tools are only visible today as `traceloop.span.kind="tool"` (~13k/24h) and internal function spans.
- **Unblocks:** per-tool success/error rate, malformed-argument rate, MCP method/session/server analytics, per-tool cost.
- **Best practice:** Emit `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.description` on tool spans; emit `mcp.method.name`, `mcp.server.name`, `mcp.session.id`, `mcp.is_error`, `mcp.response.value` on MCP client/server spans (OTel MCP conventions).

### P1.4 Cost & token completeness  → FinOps accuracy
- **Missing:** `gen_ai.usage.cost` (0); reasoning/cached token fields not consistently present.
- **Present:** `gen_ai.usage.input_tokens`/`output_tokens` (the app derives cost from these + a pricing table).
- **Best practice:** Emit `gen_ai.usage.cost` when the provider returns it; emit `gen_ai.usage.cached_tokens` / `gen_ai.usage.cache_creation_input_tokens` and reasoning tokens so cache savings and reasoning spend are visible.

### P1.5 TTFT & latency split  → perceived performance
- **Missing:** all TTFT variants (`gen_ai.usage.time_to_first_token`, `gen_ai.response.ttft`, `gen_ai.response.time_to_first_chunk` = 0); no client-vs-server latency split.
- **Best practice:** Emit TTFT on streamed responses; record both client-observed and server-processing durations so queue/cold-start latency is separable from generation latency.

---

## P2 — Completes / sharpens

| ID | Attribute(s) | Capability unlocked | Best practice |
|---|---|---|---|
| P2.1 | `vector_db.query.text`, `vector_db.results`, `vector_db.query.top_k`, `gen_ai.request.embedding_dimensions` | RAG: retrieval precision/recall, retrieved-doc capture, context bottleneck analysis | Emit retrieval query, returned chunks/scores, and top_k on retrieval spans |
| P2.2 | `gen_ai.privacy.pii_detected`, `gen_ai.privacy.pii_categories`, `gen_ai.request.guardrail_id`, `gen_ai.response.guardrail_action` | Security/governance: PII exposure, guardrail/jailbreak block rate | Run PII + injection/jailbreak detection; record detection + redaction + guardrail outcome on the span |
| P2.3 | `exception.type`, `gen_ai.error.code`, `gen_ai.error.message` | Error taxonomy: provider vs orchestration vs input | Record exception type/message and provider error codes on error spans |
| P2.4 | `gen_ai.agent.type`, `gen_ai.agent.iteration`, `gen_ai.agent.max_iterations`, `gen_ai.framework` | Agent loop/non-termination detection; framework attribution | Emit agent loop counters and a stable framework tag |
| P2.5 | `gen_ai.request.retry_count`, provider rate-limit signals (HTTP 429) | Retry/throttle latency inflation | Record retry count and surface 429s explicitly |
| P2.6 | `gen_ai.input.messages` / `gen_ai.output.messages` (structured), denser `gen_ai.prompt.0.content` (currently ~5k/24h) | Prompt analytics, replay, prompt-injection detection | Capture structured messages (roles preserved) behind a privacy control; raise content-capture coverage |
| P2.7 | business-event linkage (`bizevents`) + an outcome attribute | ROI / value-per-dollar / quality→outcome | Tie a conversation/agent run to a business outcome event (booking made, ticket resolved) |

---

## Already strong (keep emitting)

`gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.request.model` / `gen_ai.response.model`, `gen_ai.usage.input_tokens` / `output_tokens`, `gen_ai.agent.name`, `traceloop.span.kind` + `traceloop.workflow.name` + `traceloop.entity.*`, `langgraph_node`/`step`/`path`, `gen_ai.response.finish_reasons`, `http.response.status_code`, `service.name` / `dt.service.name` / `k8s.*` / `host.name`, `db.system`.

---

## One-line summary for leadership

> The biggest single win is **trace-context propagation across the LLM proxy (P0.1)** — it alone unblocks end-to-end traces, per-agent/per-session cost, and correct error attribution. After that, **session/user identity (P1.1)** and **evaluation scores (P1.2)** unlock the two areas the app cannot currently answer at all: per-user/session economics and response quality.

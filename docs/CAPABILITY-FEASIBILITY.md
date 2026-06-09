# Capability Feasibility — "What would it take?"

For each requested capability: the **data dependency** (verified against `ualpre`), the **app work** required, **who does what**, and a rough **effort**. Capabilities split cleanly into *app-buildable-now* (data already present) vs *blocked-on-instrumentation* (United must emit attributes — see `INSTRUMENTATION-REQUIREMENTS.md`).

Legend — Blocker: 🟦 app-only · 🟥 data-only · 🟨 both.

| # | Capability | Blocker | Data status (ualpre) | App work | Effort |
|---|---|---|---|---|---|
| 1 | **Proxy-span resilience** (null IDs, Bedrock/boto3 gap) | 🟨 | LLM spans present but agent-detached; Bedrock via boto3 under-attributed | App: fall back to `gen_ai.conversation.id`/heuristic correlation when `trace.id` link is absent; flag unattributed proxy spans | Data P0; App M |
| 2 | **Reasoning & cached-token accounting** | 🟨 | `input/output_tokens` present; `cached_tokens`, `cache_creation_input_tokens`, reasoning tokens absent | App: add cache-hit % and reasoning-token columns/tiles once emitted; today show a data-gap note | Data P1; App S |
| 3 | **Client vs server-side latency split** | 🟨 | `duration` present (server); no client-observed duration; TTFT absent | App: render split + TTFT once emitted; today decompose server-side by `span.kind` (buildable now) | Data P1; App M |
| 4 | **Tool-call failure + malformed-argument rate** | 🟨 | tool spans via `traceloop.span.kind="tool"` (~13k/24h); no `gen_ai.tool.*`, no arg/error attrs | App: compute success/error rate from logical-error rule on tool spans (buildable now, partial); full malformed-arg needs `gen_ai.tool.*` + arg validation attr | Data P1; App M |
| 5 | **Agent loop detection** (iterations / non-terminating) | 🟨 | `langgraph_step`/`node`/`path` present; `gen_ai.agent.iteration`/`max_iterations` absent | App: detect loops from repeated `langgraph_node` within a thread / step monotonicity (buildable now from langgraph attrs); sharper with iteration counters | Data P2; App M |
| 6 | **Eval capture** (`gen_ai.evaluation.result`) | 🟥 | all `gen_ai.evaluation.*` = 0 | App ready: Pulse/Agents/Models already query eval presence; will light up when emitted | Data P1; App XS |
| 7 | **Faithfulness / groundedness (RAG eval)** | 🟥 | `gen_ai.evaluation.faithfulness` = 0; no `vector_db.*` | App: surface scores + link to retrieval once both emitted | Data P1+P2; App S |
| 8 | **Hallucination & toxicity scoring** | 🟥 | `gen_ai.evaluation.hallucination` = 0; no toxicity attr | App: rate + trigger drill-down once emitted | Data P1; App S |
| 9 | **Eval tooling integration** (DeepEval / Ragas / LLM-judge) | 🟥 | pipeline + write-back not present | Mostly United: run judge/Ragas, write `gen_ai.evaluation.*` to spans (or bizevents). App: consume | Data P1; App S |
| 10 | **RAG retrieval-document capture** | 🟥 | `vector_db.query.text` / `results` / `top_k` = 0 (only `db.system` present) | App: retrieved-chunk panel once emitted | Data P2; App M |
| 11 | **Retrieval quality (precision / recall)** | 🟥 | needs retrieved docs + relevance labels | United: capture retrieval + relevance judgments. App: compute & trend | Data P2; App M |
| 12 | **Context-window utilization** | 🟦 | `input_tokens` + model context window present | **Buildable now** — already on Models tab; extend to Agents/Pulse | App S |
| 13 | **Content-logging / PII exposure control** | 🟨 | `gen_ai.prompt.0.content` present but sparse (~5k/24h); no privacy flags | App already has privacy masking controls (Prompts); extend coverage + governance view; needs denser content + PII flags | Data P2; App M |
| 14 | **PII detection & redaction** | 🟥 | `gen_ai.privacy.pii_detected` / `pii_categories` = 0 | United: run PII detection + redaction, stamp attrs. App: exposure dashboard | Data P2; App S |
| 15 | **Prompt injection / jailbreak detection** | 🟥 | no detection/guardrail attrs | United: detector + `guardrail_action`. App: block-rate + offender drill-down | Data P2; App S |
| 16 | **Adoption tracking** | 🟨 | no `session.id`/`gen_ai.user`/`conversation.id` (all 0) | App: adoption funnel, active users, abandonment — needs identity attrs first | Data P1; App M |

## What we can ship in the app **now** (no new instrumentation)
- **#12 Context-window utilization** everywhere (already on Models).
- **#4 (partial)** tool success/error rate from the new logical-error rule on `traceloop.span.kind="tool"` spans.
- **#5 (partial)** agent loop heuristics from `langgraph_node`/`step`/`path`.
- **#3 (partial)** server-side latency decomposition by `span.kind` (already on Agents; extend to Pulse).
- **#1 (partial)** flag unattributed proxy spans and best-effort conversation-id correlation.
- Honest **data-gap callouts** for every 🟥/🟨 above (the `DataGapNote` component), so each widget states what's missing + best practice.

## What is blocked on United instrumentation
Everything quality (#6–#9), RAG content (#10–#11), governance (#13–#15), and identity-dependent adoption/cost (#16) — all trace back to the P0/P1 items in `INSTRUMENTATION-REQUIREMENTS.md`. The ordering that unblocks the most, fastest: **P0.1 trace propagation → P1.1 identity → P1.2 eval → P1.3 tool/MCP**.

## Effort key
XS < 0.5d · S ~1d · M ~2–4d · (data effort owned by United, sizes indicative)

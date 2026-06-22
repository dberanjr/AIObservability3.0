# Enabling cost & token attribution for Tools and MCP servers

**Status:** Not implementable on the current telemetry — requires an upstream instrumentation change. This doc says exactly what to change so the Pulse **Tools** and **MCP servers** donut details can show **accurate** cost & token usage (like the **Models** donut does today).

## Why it doesn't work today

The Models donut is accurate because tokens and cost live **on the LLM span itself** (`gen_ai.usage.*` + model → priced via the app's rate table).

Tool spans and MCP-server spans carry **no tokens and no model** — a tool call doesn't consume tokens; the LLM does. So the only way to put a cost on a tool/server is to **attribute** it to the LLM call that the tool's output feeds (the "next LLM call after the tool"). That requires being able to **link a tool span to its LLM call**.

On this tenant that link does not exist:

| Signal (measured on ualpre, 6h) | Result |
|---|---|
| Tool-containing traces that also contain an LLM span | **0.4%** |
| MCP-server-containing traces that also contain an LLM span | **0.03%** |
| LLM-containing traces (same window, for scale) | ~82,763 |
| `gen_ai.conversation.id` / `session.id` on tool spans | **0** (absent) |

**Root cause:** the LLM calls are routed through a **central proxy that starts its own trace**, disjoint from the agent/tool trace. And tool spans carry **no correlation key** (`conversation.id`, `session.id`) to stitch them to the LLM call across traces. So there is neither a shared `trace.id` nor a shared business key to attribute on. Every attribution model (next-call, co-occurrence, service-blended) collapses to ~0% coverage or fabricated numbers — which is why the app intentionally does **not** show tool/MCP cost.

## The fix (pick one)

Either of these makes attribution trivial and accurate. **Option A is preferred.**

### Option A — Propagate trace context through the tool → LLM path (one trace)
Ensure the LLM call triggered by (or following) a tool call shares the **same `trace.id`** as the tool span. Concretely:
- Propagate the active OpenTelemetry trace context (W3C `traceparent`) from the agent/tool execution **through the LLM proxy** so the proxy's LLM span is a child of the same trace, not a new root.
- If the proxy can't be made context-aware, have the client forward `traceparent` on the call to the proxy and the proxy continue the trace.

Result: tool span and its next LLM span are in one trace, ordered by `start_time`. The app can then pair each tool call with the immediately-following LLM call and sum that call's tokens/cost per tool and per MCP server — **causal and roughly additive**.

### Option B — Stamp a shared correlation id on both spans
If a single trace isn't achievable, emit the **same correlation id on both** the tool/MCP span and the LLM span it drives:
- Preferred: `gen_ai.conversation.id` (OTel GenAI semconv) on every tool, MCP, and LLM span in a conversation/turn.
- Acceptable: `session.id`, or a custom `gen_ai.request.id` / turn id consistently stamped on both sides.

Result: the app attributes by grouping LLM tokens/cost to the tool/server sharing the correlation id (scoped to a turn to avoid over-counting).

### Minimum attributes to emit on tool / MCP spans
For Option A: nothing extra — just correct trace-context propagation.
For Option B: a shared key present on **both** the tool/MCP span and the LLM span — `gen_ai.conversation.id` (and ideally a per-turn id). Tool/MCP spans already carry `gen_ai.tool.name` / `traceloop.span.kind == "tool"` / `traceloop.workflow.name` (the `.mcp` label) for grouping; those are fine.

## What the app does once the data is there

With either fix, the Tools and MCP-server donut details gain **Tokens** and **Cost** columns (matching the Models detail), computed as: for each tool call, the tokens & cost of the paired LLM call (`costOf(inTok, outTok, model)`), summed per tool name and per MCP server. The popup would carry a short note explaining the attribution (each tool call credited with the tokens/cost of the LLM call it feeds) so users understand it's a causal estimate.

Re-validate coverage after the instrumentation change (the 0.4%/0.03% co-occurrence should jump to near-100% for in-process agents) before enabling the columns.

---

*Decision (2026-06-22): deferred to upstream instrumentation rather than ship a misleading estimate. App code unchanged. Re-open the "tool/MCP cost attribution" work once tool and LLM spans share a trace or a correlation id.*

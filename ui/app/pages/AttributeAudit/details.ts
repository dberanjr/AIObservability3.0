/**
 * AAA — per-attribute deep-dive content for the detail modal.
 *
 * Each attribute resolves to an AttrDetail describing why it matters, the
 * benefits it unlocks, how it combines with sibling attributes to raise the
 * value of the telemetry, and industry best practices with references.
 *
 * Curated entries (ATTR_DETAILS) cover the highest-value attributes; every
 * other attribute falls back to a composed detail built from the catalog
 * (buildDetail). Either way the modal is always substantive.
 *
 * LINK POLICY: external links point ONLY to vendor-neutral open standards —
 * the OpenTelemetry semantic conventions (CNCF) and the open Model Context
 * Protocol specification. We deliberately do NOT link to Dynatrace
 * competitors or to other AI-observability vendors/tools (e.g. tracing SaaS,
 * LLM-eval platforms, instrumentation vendors), even when they authored a
 * convention — we describe the convention and reference the neutral standard
 * instead.
 */

import type { AuditSection } from "./catalog";

export interface DetailLink {
  label: string;
  url: string;
}

export interface BestPractice {
  text: string;
  ref?: DetailLink;
}

export interface AttrDetail {
  why: string;
  benefits: string[];
  synergy: string;
  bestPractices: BestPractice[];
  links: DetailLink[];
}

// ---- Neutral reference sources -------------------------------------------

const OTEL = {
  genai: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/",
  genaiSpans: "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/",
  db: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/db/",
  session: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/session/",
  service: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/",
  k8s: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/",
  host: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/host/",
  http: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/http/",
  rpc: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/rpc/",
  exception: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/exception/",
  semconv: "https://opentelemetry.io/docs/specs/semconv/",
} as const;

const MCP_SPEC = "https://modelcontextprotocol.io";

const GENAI_REF: DetailLink = { label: "OpenTelemetry GenAI conventions", url: OTEL.genai };
const GENAI_SPANS_REF: DetailLink = { label: "OpenTelemetry GenAI spans", url: OTEL.genaiSpans };
const MCP_REF: DetailLink = { label: "Model Context Protocol spec", url: MCP_SPEC };

/**
 * Vendor-neutral "learn more" links chosen by attribute prefix. Framework
 * conventions (traceloop.*, langgraph_*) intentionally resolve to the neutral
 * OpenTelemetry GenAI agent conventions rather than a vendor site.
 */
export const neutralLinksFor = (name: string): DetailLink[] => {
  const n = name.toLowerCase();
  if (n.startsWith("mcp.")) return [MCP_REF, { label: "OpenTelemetry MCP attributes", url: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/mcp/" }];
  if (n.startsWith("gen_ai.")) return [GENAI_REF, GENAI_SPANS_REF];
  if (n.startsWith("traceloop") || n.startsWith("langgraph")) return [GENAI_REF, GENAI_SPANS_REF];
  if (n.startsWith("db.") || n.startsWith("vector_db")) return [{ label: "OpenTelemetry database attributes", url: OTEL.db }];
  if (n.startsWith("session.")) return [{ label: "OpenTelemetry session attributes", url: OTEL.session }];
  if (n.startsWith("service.") || n.startsWith("dt.service")) return [{ label: "OpenTelemetry service attributes", url: OTEL.service }];
  if (n.startsWith("k8s")) return [{ label: "OpenTelemetry Kubernetes attributes", url: OTEL.k8s }];
  if (n.startsWith("host.")) return [{ label: "OpenTelemetry host attributes", url: OTEL.host }];
  if (n.startsWith("http")) return [{ label: "OpenTelemetry HTTP attributes", url: OTEL.http }];
  if (n.startsWith("rpc")) return [{ label: "OpenTelemetry RPC attributes", url: OTEL.rpc }];
  if (n.startsWith("exception")) return [{ label: "OpenTelemetry exception attributes", url: OTEL.exception }];
  return [{ label: "OpenTelemetry semantic conventions", url: OTEL.semconv }];
};

// ---- Curated deep dives ---------------------------------------------------

const D = (d: AttrDetail): AttrDetail => d;

export const ATTR_DETAILS: Record<string, AttrDetail> = {
  "gen_ai.provider.name": D({
    why: "The provider is the first dimension every other AI metric is sliced by. Without it you cannot tell whether a latency spike, cost jump, or error wave belongs to OpenAI, Anthropic, Bedrock, or a self-hosted model — so you cannot route the fix to the right team or vendor.",
    benefits: [
      "Attribute cost and latency to a specific vendor for chargeback and SLA conversations.",
      "Compare providers head-to-head on price, speed, and error rate for the same workload.",
      "Detect provider-wide outages instantly by grouping error rate by provider.",
    ],
    synergy:
      "Paired with gen_ai.request.model and gen_ai.usage.*_tokens it turns raw spans into a full cost-and-performance ledger per provider/model. Combined with gen_ai.response.finish_reasons it separates provider faults from prompt faults.",
    bestPractices: [
      { text: "Always emit a normalized provider name (lowercase, stable spelling) so dashboards don't fragment 'OpenAI' vs 'openai'.", ref: GENAI_REF },
      { text: "Record provider on every gen_ai span — request, response, and error — not just the successful ones, so failure analysis isn't blind.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.operation.name": D({
    why: "Operation name (chat, text_completion, embeddings, …) tells you what kind of call a span represents. It is the switch that lets you apply the right cost model, latency expectation, and quality check to each call — an embedding call and a chat completion should never be analysed the same way.",
    benefits: [
      "Separate embedding traffic from generation traffic so token economics stay accurate.",
      "Apply operation-appropriate latency SLOs (embeddings are fast; long generations are not).",
      "Drive correct cost math, since pricing differs sharply by operation type.",
    ],
    synergy:
      "Works with gen_ai.request.model (same model, different operations) and the token attributes to keep cost and efficiency dashboards from mixing incomparable calls. It also scopes evaluation: faithfulness only makes sense on generation, not embeddings.",
    bestPractices: [
      { text: "Use the standard operation values from the GenAI conventions so cross-service dashboards line up.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.request.model": D({
    why: "The requested model is the unit of cost, capability, and risk. Almost every FinOps and performance decision — switching models, negotiating commit tiers, chasing a regression — starts from a per-model breakdown.",
    benefits: [
      "Per-model cost and token dashboards for FinOps and capacity planning.",
      "Spot silent model swaps or fallbacks that change cost or quality.",
      "Benchmark a cheaper model against an incumbent on real production traffic.",
    ],
    synergy:
      "Compared against gen_ai.response.model it reveals provider-side downgrades/routing. Combined with gen_ai.usage.cost and the token counts it yields cost-per-call and cost-per-1k-tokens; with evaluation scores it yields quality-per-dollar.",
    bestPractices: [
      { text: "Capture both the requested and the responded model so routing and fallback behaviour is visible.", ref: GENAI_REF },
      { text: "Keep model identifiers raw (e.g. 'gpt-4o-2024-08-06') so version-level regressions are attributable.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.response.model": D({
    why: "The model the provider actually used can differ from the one you requested — due to aliasing, routing, or fallback. That gap is invisible unless you record both, and it directly affects cost and quality.",
    benefits: [
      "Detect provider routing/fallback that silently changes cost or behaviour.",
      "Reconcile billing: providers bill on the served model, not the requested alias.",
      "Pin quality regressions to a specific served model version.",
    ],
    synergy:
      "Only meaningful next to gen_ai.request.model — the pair exposes drift. With gen_ai.usage.cost it explains unexpected bill changes when an alias resolves to a pricier model.",
    bestPractices: [
      { text: "Emit response.model whenever the provider returns it; diff it against request.model in a dashboard.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.usage.input_tokens": D({
    why: "Input tokens are half of every LLM bill and the main driver of context-window pressure. Without them cost attribution is guesswork and you cannot see prompt bloat creeping in.",
    benefits: [
      "Accurate, per-call input cost instead of estimated averages.",
      "Catch prompt bloat and runaway context growth before it inflates spend.",
      "Right-size context windows and trim unnecessary system text.",
    ],
    synergy:
      "With gen_ai.usage.output_tokens and gen_ai.usage.total_tokens it completes the token ledger; with gen_ai.usage.cached_tokens it shows how much input was served cheaply from cache; with gen_ai.request.model it converts tokens to dollars.",
    bestPractices: [
      { text: "Record input and output tokens separately — they price differently and bloat for different reasons.", ref: GENAI_REF },
      { text: "Reconcile SDK token counts against provider usage periodically to catch under-counting.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.usage.output_tokens": D({
    why: "Output tokens are usually the most expensive part of a call and the strongest correlate of latency — long generations cost more and take longer. Tracking them is essential for both FinOps and performance.",
    benefits: [
      "Pinpoint expensive, verbose responses and cap them with max_tokens.",
      "Explain latency: output length is the dominant latency factor in generation.",
      "Trend response length to detect prompt changes that make models ramble.",
    ],
    synergy:
      "Combined with input_tokens it gives total cost; with duration and gen_ai.response.ttft it separates 'slow to start' from 'long to finish'; with finish_reasons it shows truncation when output hits the cap.",
    bestPractices: [
      { text: "Alert on output-token outliers — they are early signals of cost regressions and runaway generations.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.usage.total_tokens": D({
    why: "Total tokens is the quickest single number for capacity and cost trending across the fleet. It is the headline metric for token-budget forecasting and commit-tier planning.",
    benefits: [
      "One-glance fleet-wide consumption for budgeting and forecasting.",
      "Feeds anomaly detection on overall AI spend.",
      "Simplifies executive reporting on AI usage growth.",
    ],
    synergy:
      "Should reconcile with input_tokens + output_tokens; a mismatch flags instrumentation gaps. With gen_ai.request.model it underpins cost-per-model rollups.",
    bestPractices: [
      { text: "Treat total as a cross-check on the split counts, not a replacement — keep all three.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.request.temperature": D({
    why: "Temperature controls output randomness and is a prime suspect when answers become inconsistent or hallucinate. Capturing it lets you correlate quality problems with sampling configuration.",
    benefits: [
      "Correlate hallucination/inconsistency spikes with high temperature.",
      "Audit that deterministic workloads (e.g. extraction) actually run at low temperature.",
      "Catch accidental config drift after a deploy.",
    ],
    synergy:
      "Most powerful next to evaluation scores (hallucination, correctness) and gen_ai.request.seed — together they explain reproducibility and quality variance. With top_p it documents the full sampling regime.",
    bestPractices: [
      { text: "Log all sampling parameters together so a quality regression can be tied to a config change.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.request.max_tokens": D({
    why: "max_tokens is the truncation ceiling. When responses are cut off mid-thought, this attribute plus finish_reasons tells you whether the cap (not the model) is to blame.",
    benefits: [
      "Diagnose truncated answers definitively.",
      "Bound worst-case cost and latency per call.",
      "Tune the ceiling to balance completeness against spend.",
    ],
    synergy:
      "Read together with gen_ai.response.finish_reasons ('length') and gen_ai.usage.output_tokens to confirm truncation, and with cost attributes to model the spend ceiling.",
    bestPractices: [
      { text: "Always pair a max_tokens cap with a finish_reasons check so truncation is observable, not silent.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.response.finish_reasons": D({
    why: "Finish reason is the model's own explanation for why it stopped — stop, length, content_filter, tool_calls. It is the single most useful field for separating healthy completions from truncations, refusals, and tool hand-offs.",
    benefits: [
      "Distinguish truncation (length) from normal stops and safety blocks (content_filter).",
      "Measure how often the model chooses to call tools vs. answer directly.",
      "Track refusal/guardrail rates as a quality and UX signal.",
    ],
    synergy:
      "With max_tokens + output_tokens it confirms truncation; with gen_ai.response.tool_calls it explains agentic hand-offs; with guardrail attributes it quantifies safety interventions.",
    bestPractices: [
      { text: "Chart finish-reason distribution over time — a rising 'length' share means prompts or caps need tuning.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.response.ttft": D({
    why: "Time-to-first-token is the latency users actually feel in a streaming UI. Average duration hides it; TTFT exposes whether the experience feels snappy or sluggish regardless of total length.",
    benefits: [
      "Measure perceived responsiveness, the metric users care about in chat UIs.",
      "Separate 'slow to start' (queueing/cold start) from 'long to finish' (verbose output).",
      "Set realistic streaming SLOs that reflect UX, not just totals.",
    ],
    synergy:
      "Combined with total duration and output_tokens it decomposes latency into start-up vs. generation. With provider/model it reveals which combinations start fastest.",
    bestPractices: [
      { text: "For streamed responses, track TTFT as a first-class latency SLI alongside total duration.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.usage.cached_tokens": D({
    why: "Prompt caching can cut input cost dramatically. Without a cached-tokens count you cannot prove cache effectiveness or spot when a prompt change quietly destroys your cache-hit rate.",
    benefits: [
      "Quantify real savings from prompt caching.",
      "Detect cache-busting prompt edits that spike cost.",
      "Justify prompt-structuring effort with hard numbers.",
    ],
    synergy:
      "Set against gen_ai.usage.input_tokens it yields a cache-hit ratio; with gen_ai.usage.cost it converts that ratio into dollars saved; cache_creation_input_tokens shows the write side.",
    bestPractices: [
      { text: "Track cache-read and cache-creation tokens separately to see both the savings and the warm-up cost.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.usage.cost": D({
    why: "An SDK-reported cost removes guesswork from FinOps. When present it is the ground truth for spend; when absent you must reconstruct cost from tokens and a pricing table that can drift.",
    benefits: [
      "Direct, per-call spend without maintaining a pricing table.",
      "Immediate cost anomaly detection and budget alerting.",
      "Trustworthy chargeback to teams and features.",
    ],
    synergy:
      "Cross-checks the token-derived cost (model + input/output tokens). Grouped by gen_ai.agent.name or service it powers per-owner chargeback.",
    bestPractices: [
      { text: "If the SDK doesn't emit cost, derive it from model + tokens and keep the pricing table versioned.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.prompt.0.content": D({
    why: "The actual prompt text is what makes an AI trace debuggable. When an answer is wrong, the prompt is the first thing you need to see — without it you are debugging blind.",
    benefits: [
      "Root-cause bad answers by inspecting the exact input.",
      "Build prompt-quality analytics and detect prompt drift.",
      "Reproduce and regression-test failures.",
    ],
    synergy:
      "Pairs with gen_ai.completion.0.content (the response) for full input/output capture, and with evaluation scores to tie quality numbers back to concrete text. session/conversation ids stitch multi-turn prompts together.",
    bestPractices: [
      { text: "Capture prompt and completion content behind a privacy control — redact or hash PII before it lands in spans.", ref: GENAI_SPANS_REF },
      { text: "Prefer the structured messages form where available so roles (system/user/assistant) are preserved.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.system_instructions": D({
    why: "The system prompt shapes every response. Capturing it lets you attribute behaviour changes to system-prompt edits — a leading cause of 'it worked yesterday' regressions.",
    benefits: [
      "Tie behaviour shifts to system-prompt versions.",
      "Audit that safety/policy instructions are actually present.",
      "Compare system-prompt variants in A/B experiments.",
    ],
    synergy:
      "With prompt/completion content it completes the picture of what the model saw; with evaluation scores it links instruction wording to measured quality.",
    bestPractices: [
      { text: "Version your system prompts and record an identifier so changes are traceable.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.agent.name": D({
    why: "The agent name is the anchor for everything agentic. It is how you attribute cost, latency, error rate, and quality to a specific autonomous agent instead of an anonymous pile of LLM calls.",
    benefits: [
      "Per-agent dashboards for cost, reliability, and performance.",
      "Owner-level accountability and chargeback.",
      "Fleet views that rank agents by spend or failure rate.",
    ],
    synergy:
      "Joins LLM, tool, and workflow spans into one agent story when combined with traceloop.workflow.name and gen_ai.tool.name. With conversation/session ids it follows an agent across a user journey.",
    bestPractices: [
      { text: "Give every agent a stable, unique name and emit it on all spans the agent produces.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.tool.name": D({
    why: "Tool name identifies which external capability an agent invoked. It is the foundation of tool-health analysis — you cannot find a failing or slow tool you cannot name.",
    benefits: [
      "Per-tool error rate and latency to find the weak link in an agent.",
      "Usage analytics: which tools matter, which are dead weight.",
      "Blast-radius analysis when a downstream tool degrades.",
    ],
    synergy:
      "With gen_ai.tool.call.id it correlates a call to its result; with traceloop.span.kind = tool it scopes the tool population; with mcp.* it links tool calls to the serving MCP server.",
    bestPractices: [
      { text: "Emit a stable tool name plus a call id so each invocation is independently traceable.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.tool.call.id": D({
    why: "The call id uniquely identifies one tool invocation, letting you correlate the request, the arguments, and the eventual result even when the same tool is called many times in a turn.",
    benefits: [
      "Correlate tool request and response precisely.",
      "Debug parallel tool calls without ambiguity.",
      "Measure per-invocation tool latency and failure.",
    ],
    synergy:
      "Meaningless without gen_ai.tool.name; together they make tool execution fully traceable, and with finish_reasons = tool_calls they connect the model's decision to the executed call.",
    bestPractices: [
      { text: "Propagate the provider's tool-call id end to end so request/result joins are exact.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "traceloop.workflow.name": D({
    why: "The workflow name is the top of the agent trace hierarchy. It groups the many LLM, tool, and task spans of one logical operation under a single, queryable name — the difference between a readable trace and span soup.",
    benefits: [
      "End-to-end latency and cost per logical workflow, not per span.",
      "Compare workflow variants and detect regressions at the right altitude.",
      "Navigate large agent traces by their business operation.",
    ],
    synergy:
      "With traceloop.span.kind and traceloop.entity.* it reconstructs the full execution tree; with gen_ai.agent.name it ties a workflow to the agent that ran it.",
    bestPractices: [
      { text: "Name workflows after the business operation they perform so traces map to user-visible features.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "traceloop.span.kind": D({
    why: "Span kind (workflow / task / agent / tool / llm) classifies every span in an agent trace. It is what lets tooling render a meaningful waterfall and lets you filter to just the LLM calls, just the tools, etc.",
    benefits: [
      "Filter and aggregate by span role across the whole fleet.",
      "Render readable agent waterfalls.",
      "Scope analyses correctly (e.g. tool error rate over tool spans only).",
    ],
    synergy:
      "It is the backbone the other Traceloop attributes hang off; combined with workflow.name and entity.path it fully describes the trace tree.",
    bestPractices: [
      { text: "Set span kind on every instrumented span so downstream filtering never falls back to guesswork.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  langgraph_node: D({
    why: "In a LangGraph agent the node is where execution actually happens. Knowing which node emitted a span is essential to debug stateful, branching graphs — otherwise every step looks the same.",
    benefits: [
      "Per-node latency and error breakdown to find the slow/buggy node.",
      "Reconstruct the path a request took through the graph.",
      "Spot hot nodes and dead branches.",
    ],
    synergy:
      "With langgraph_step and langgraph_path it orders and locates execution; with thread_id it follows a conversation across graph runs.",
    bestPractices: [
      { text: "Emit graph node, step, and a run/thread id together so a single graph execution is fully reconstructable.", ref: GENAI_SPANS_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "mcp.method.name": D({
    why: "The MCP method (initialize, tools/list, tools/call, …) is the verb of the Model Context Protocol. It turns opaque MCP traffic into a typed RPC stream you can measure per method.",
    benefits: [
      "Per-method latency and error rate for MCP servers.",
      "See the handshake/list/call lifecycle explicitly.",
      "Detect protocol misuse or chatty clients.",
    ],
    synergy:
      "With mcp.server.name and mcp.session.id it pinpoints which server and session a call belongs to; with mcp.is_error it gives first-class MCP error analytics instead of inferring from generic spans.",
    bestPractices: [
      { text: "Instrument MCP spans with method, server, session, and an explicit error flag per the protocol's semantics.", ref: MCP_REF },
    ],
    links: [MCP_REF, { label: "OpenTelemetry MCP attributes", url: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/mcp/" }],
  }),
  "mcp.session.id": D({
    why: "The MCP session id ties a sequence of protocol calls into one stable conversation between client and server. It is how you measure session length, stability, and per-session failure.",
    benefits: [
      "Group MCP calls into sessions for stability analysis.",
      "Detect sessions that churn, stall, or error repeatedly.",
      "Correlate a user journey across many MCP calls.",
    ],
    synergy:
      "With mcp.method.name it reconstructs the session lifecycle; with mcp.server.name it attributes session health to a server.",
    bestPractices: [
      { text: "Propagate a single session id for the life of an MCP connection so session metrics are coherent.", ref: MCP_REF },
    ],
    links: [MCP_REF, { label: "OpenTelemetry MCP attributes", url: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/mcp/" }],
  }),
  "mcp.is_error": D({
    why: "An explicit MCP error flag is far more reliable than inferring failure from span status or response shape. It is the cleanest signal for MCP tool reliability dashboards.",
    benefits: [
      "Accurate per-tool, per-server MCP error rates.",
      "Alert on MCP failures without brittle heuristics.",
      "Separate protocol errors from application errors.",
    ],
    synergy:
      "With mcp.method.name and mcp.server.name it localizes failures to a method and server; with mcp.response.value it lets you inspect the failing payload.",
    bestPractices: [
      { text: "Set an explicit boolean error flag on MCP spans rather than relying on downstream inference.", ref: MCP_REF },
    ],
    links: [MCP_REF, { label: "OpenTelemetry MCP attributes", url: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/mcp/" }],
  }),
  "gen_ai.evaluation.faithfulness": D({
    why: "Faithfulness measures whether a RAG answer is actually grounded in the retrieved documents — the core defence against confident-but-wrong responses. It moves observability from 'is it up?' to 'is it correct?'.",
    benefits: [
      "Quantify and trend grounding quality in production.",
      "Catch retrieval regressions that cause ungrounded answers.",
      "Gate releases on a faithfulness threshold.",
    ],
    synergy:
      "With the vector_db.* attributes it links a low score back to weak retrieval; with prompt/completion content it lets a human verify the judgement; alongside hallucination and relevance it forms a quality scorecard.",
    bestPractices: [
      { text: "Score a sampled, representative slice continuously rather than only in offline eval, and store the score on the span.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.evaluation.hallucination": D({
    why: "A hallucination score flags fabricated content — the failure mode that most erodes user trust. Tracking it in production is the only way to know your real hallucination rate, not your lab rate.",
    benefits: [
      "Production hallucination rate as a first-class reliability SLI.",
      "Early warning when a prompt or model change degrades factuality.",
      "Evidence for safe rollout / rollback decisions.",
    ],
    synergy:
      "With temperature and model it correlates hallucination to configuration; with faithfulness and retrieval attributes it separates RAG-grounding failures from model fabrication.",
    bestPractices: [
      { text: "Define a clear hallucination scale and keep the judge model/version recorded for reproducibility.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.evaluation.score": D({
    why: "A composite evaluation score is the headline quality number for an AI feature — the single metric leadership and SLOs can rally around, backed by the component scores beneath it.",
    benefits: [
      "One quality KPI for dashboards and SLOs.",
      "Trend overall quality across releases.",
      "Trigger automated rollback when quality drops.",
    ],
    synergy:
      "Decomposes into faithfulness/correctness/relevance for diagnosis; with cost and model it yields quality-per-dollar, the metric that justifies model choices.",
    bestPractices: [
      { text: "Always keep the component scores alongside the composite so a drop is explainable, not just visible.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "gen_ai.conversation.id": D({
    why: "The conversation id stitches individual turns into a coherent multi-turn dialogue. Without it a conversation is scattered across unrelated spans and you can never analyse a full user exchange.",
    benefits: [
      "Reconstruct and replay entire multi-turn conversations.",
      "Measure conversation-level cost, length, and success.",
      "Detect dialogues that loop, stall, or escalate.",
    ],
    synergy:
      "With session.id and gen_ai.user it links turn → conversation → session → user; with prompt/completion content it makes the whole exchange readable end to end.",
    bestPractices: [
      { text: "Propagate a stable conversation id across every turn and every backend hop.", ref: GENAI_REF },
    ],
    links: [GENAI_REF, GENAI_SPANS_REF],
  }),
  "session.id": D({
    why: "The application session id ties AI activity to a single user session, the natural unit for analysing a user's experience and for connecting front-end behaviour to back-end model calls.",
    benefits: [
      "Session-scoped cost and quality analysis.",
      "Connect a user's UI actions to the AI calls they triggered.",
      "Spot sessions with repeated failures or runaway spend.",
    ],
    synergy:
      "With dt.rum.session.id it bridges real-user monitoring to AI spans; with gen_ai.conversation.id it nests conversations inside sessions.",
    bestPractices: [
      { text: "Use a consistent session id across front end and back end so the full journey is one trace.", ref: { label: "OpenTelemetry session attributes", url: OTEL.session } },
    ],
    links: [{ label: "OpenTelemetry session attributes", url: OTEL.session }],
  }),
  "dt.rum.session.id": D({
    why: "This id links a Dynatrace Real User Monitoring session to the AI spans behind it — the front-to-back connection that lets you trace a slow or wrong answer from the user's screen all the way to the model call.",
    benefits: [
      "True end-to-end traces from browser click to LLM response.",
      "Attribute user-perceived slowness to a specific model call.",
      "Unify RUM and AI analytics in one journey view.",
    ],
    synergy:
      "With session.id and conversation.id it completes the identity chain; with gen_ai.response.ttft it explains user-felt latency at the AI layer.",
    bestPractices: [
      { text: "Inject the RUM session id into outgoing AI requests so back-end spans can carry it.", ref: { label: "OpenTelemetry session attributes", url: OTEL.session } },
    ],
    links: [{ label: "OpenTelemetry session attributes", url: OTEL.session }],
  }),
  "db.system": D({
    why: "db.system identifies the datastore behind a span — including the vector store powering RAG. It is the entry point for retrieval observability and for separating vector traffic from ordinary database calls.",
    benefits: [
      "Identify and segment vector-store vs. relational traffic.",
      "Attribute retrieval latency to a specific engine.",
      "Inventory which datastores your AI workload depends on.",
    ],
    synergy:
      "With vector_db.query.* it turns a generic DB span into RAG retrieval telemetry; with faithfulness scores it connects retrieval source to answer grounding.",
    bestPractices: [
      { text: "Emit a standard db.system value so vector and relational stores are consistently classifiable.", ref: { label: "OpenTelemetry database attributes", url: OTEL.db } },
    ],
    links: [{ label: "OpenTelemetry database attributes", url: OTEL.db }],
  }),
  "vector_db.query.top_k": D({
    why: "top_k sets how many chunks RAG retrieves. It is a direct lever on both answer quality and cost/latency — too low starves the model, too high adds noise and tokens.",
    benefits: [
      "Tune retrieval breadth against quality and cost.",
      "Explain ungrounded answers caused by too-small top_k.",
      "Control prompt size driven by retrieved context.",
    ],
    synergy:
      "With faithfulness it shows whether more retrieval improves grounding; with input_tokens it reveals how retrieval inflates prompt cost.",
    bestPractices: [
      { text: "Record retrieval parameters (top_k, query) so RAG quality can be tied to retrieval configuration.", ref: { label: "OpenTelemetry database attributes", url: OTEL.db } },
    ],
    links: [{ label: "OpenTelemetry database attributes", url: OTEL.db }],
  }),
  "service.name": D({
    why: "service.name is the backbone of all of observability — it anchors AI spans to the service that produced them, enabling topology, ownership, and cross-signal correlation with logs and metrics.",
    benefits: [
      "Map AI activity onto your service topology.",
      "Correlate AI spans with the service's logs, metrics, and problems.",
      "Route alerts to the owning team.",
    ],
    synergy:
      "With k8s.* and host.name it places the service in its runtime; with gen_ai.* it connects model behaviour to the owning service for blast-radius analysis.",
    bestPractices: [
      { text: "Set a stable, unique service.name per deployable unit, consistently across all signals.", ref: { label: "OpenTelemetry service attributes", url: OTEL.service } },
    ],
    links: [{ label: "OpenTelemetry service attributes", url: OTEL.service }],
  }),
  "http.response.status_code": D({
    why: "HTTP status is the universal failure signal that automated problem detection keys on. For AI calls made over HTTP it is what surfaces 4xx/5xx waves to anomaly detection before users complain.",
    benefits: [
      "Standard error detection feeding automated baselining.",
      "Distinguish client (4xx) from server (5xx) failure classes.",
      "Trend provider-side HTTP errors over time.",
    ],
    synergy:
      "With gen_ai.error.* it separates transport failures from model errors; with provider/model it localizes which integration is throwing errors.",
    bestPractices: [
      { text: "Capture status codes on every outbound AI HTTP call so failures are visible to automated detection.", ref: { label: "OpenTelemetry HTTP attributes", url: OTEL.http } },
    ],
    links: [{ label: "OpenTelemetry HTTP attributes", url: OTEL.http }],
  }),
  "exception.type": D({
    why: "The exception type names what went wrong in code paths around AI calls — timeouts, rate limits, parsing failures. It is essential for turning a vague 'error' into an actionable failure class.",
    benefits: [
      "Group failures by root-cause class for faster triage.",
      "Spot rate-limit and timeout patterns specific to AI providers.",
      "Drive targeted retries and circuit-breaking.",
    ],
    synergy:
      "With http.response.status_code and gen_ai.error.* it builds a complete failure taxonomy; with service.name it routes each class to the right owner.",
    bestPractices: [
      { text: "Record exception type and message on error spans so failures are classifiable, not just countable.", ref: { label: "OpenTelemetry exception attributes", url: OTEL.exception } },
    ],
    links: [{ label: "OpenTelemetry exception attributes", url: OTEL.exception }],
  }),
};

// ---- Fallback composition -------------------------------------------------

const lc = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Resolve the detail for an attribute: a curated entry when one exists, else a
 * composed fallback built from the catalog so every tile opens something
 * useful and reference-backed.
 */
export const buildDetail = (
  section: AuditSection,
  attrName: string,
  attrWhat: string,
): AttrDetail => {
  const curated = ATTR_DETAILS[attrName];
  if (curated) return curated;

  const siblings = section.attributes
    .map((a) => a.name)
    .filter((n) => n !== attrName)
    .slice(0, 3);

  return {
    why: `${attrName} captures ${lc(attrWhat)}. ${section.blurb}`,
    benefits: [
      `Confirms ${attrName} is actually emitted, so any dashboard, segment, or alert built on it is trustworthy.`,
      `Lets you slice AI telemetry by this dimension and correlate it with the rest of the ${section.short} signals.`,
      "Adds context that automated baselining and root-cause analysis can use.",
    ],
    synergy: siblings.length
      ? `Within the ${section.short} category it works alongside ${siblings.join(", ")} — together they give a far more complete picture than any one attribute alone.`
      : `It contributes to the ${section.short} picture of your AI workload.`,
    bestPractices: [
      {
        text: "Emit this attribute consistently on every relevant span, following the OpenTelemetry GenAI semantic conventions, so it stays reliably queryable across services.",
        ref: GENAI_REF,
      },
    ],
    links: neutralLinksFor(attrName),
  };
};

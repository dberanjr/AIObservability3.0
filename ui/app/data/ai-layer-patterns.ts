/**
 * AI Application Architecture model — the 8 layers an agentic AI request flows
 * through, each with its characteristic token / error / latency behaviour, its
 * problem patterns, and the OpenTelemetry attributes that make it observable.
 *
 * This is the single source of truth for:
 *   - the Pulse architecture map (renders these layers in stackPosition order,
 *     with a reasoning-loop arc from llm back to orchestrator),
 *   - every layer problem-pattern card (the strings here are the copy — do not
 *     re-author pattern text in components; read it from this file), and
 *   - the use-case lens layer mappings.
 *
 * Canonical topology (stackPosition):
 *   client(0) → gateway(1) → orchestrator(2) → agent(3), then tools(4) & llm(4)
 *   side by side, then vectordb(5) & memory(5) side by side.
 *
 * `otelGap: true` marks layers with NO native OTel GenAI instrumentation
 * (client, gateway): the app must not fabricate a health reading for them.
 */

export type LayerKey =
  | "client"
  | "gateway"
  | "orchestrator"
  | "agent"
  | "tools"
  | "llm"
  | "vectordb"
  | "memory";

/**
 * How detectable a pattern is, mirroring brief section H:
 *   live       — detectable from standard telemetry today
 *   enrichment — detectable only when an enriching field is present (OpenPipeline
 *                rule, evaluator score, …); capability-gated, else card-only
 *   card       — documented only; not detectable even with practical enrichment
 */
export type PatternTier = "live" | "enrichment" | "card";

export interface LayerPattern {
  title: string;
  detail: string;
  tier: PatternTier;
}

export interface AiLayer {
  key: LayerKey;
  label: string;
  /** Vertical rank in the schematic; layers sharing a value sit side by side. */
  stackPosition: number;
  /** One-line token behaviour at this layer. */
  tokens: string;
  /** One-line error behaviour at this layer. */
  errors: string;
  /** One-line latency behaviour at this layer. */
  latency: string;
  /** Problem patterns that live at this layer (the card copy). */
  patterns: LayerPattern[];
  /** The OTel attributes / conventions that make this layer observable. */
  otel: string;
  /** True when there is no native OTel GenAI instrumentation for this layer. */
  otelGap: boolean;
  /** traceloop.span.kind / OTel span kinds typically seen at this layer. */
  relatedSpanKinds: string[];
  /** db.system values associated with this layer (vector stores for vectordb). */
  relatedDbSystems: string[];
}

export const AI_LAYERS: AiLayer[] = [
  {
    key: "client",
    label: "Client",
    stackPosition: 0,
    tokens: "Originates the request; no token accounting of its own.",
    errors: "User-visible failures surface here but are caused downstream.",
    latency: "End-to-end perceived latency is felt here.",
    patterns: [
      {
        title: "Prompt injection",
        detail:
          "Malicious instructions smuggled in user input. Not in raw GenAI telemetry — detectable only when an upstream OpenPipeline security/PII rule flags the span. Enable that enrichment to light this up.",
        tier: "enrichment",
      },
      {
        title: "Multimodal attachment bloat",
        detail:
          "Large images/audio/files inflate token and byte cost before the model is even called. Not practically detectable from spans today.",
        tier: "card",
      },
    ],
    otel: "No native OTel GenAI spans. Identity (session.id, gen_ai.user) must be propagated from here for per-user attribution.",
    otelGap: true,
    relatedSpanKinds: [],
    relatedDbSystems: [],
  },
  {
    key: "gateway",
    label: "Gateway / Proxy",
    stackPosition: 1,
    tokens: "Passes tokens through; may meter quota per tenant/key.",
    errors: "Auth, quota, and routing failures; 429s often originate here.",
    latency: "Adds routing/queueing overhead; backoff waits accrue here.",
    patterns: [
      {
        title: "Rate limiting / quota exhaustion",
        detail:
          "429s and throttling at the provider/gateway boundary, often with exponential-backoff retries. Detectable at the llm boundary when status/error fields are emitted.",
        tier: "live",
      },
      {
        title: "PII / injection enrichment point",
        detail:
          "The natural place to run an OpenPipeline security/PII rule that writes gen_ai.privacy.* / injection flags onto the span for downstream detection.",
        tier: "enrichment",
      },
    ],
    otel: "No native OTel GenAI spans; HTTP/proxy spans only. Best place to enrich spans with security/identity context.",
    otelGap: true,
    relatedSpanKinds: [],
    relatedDbSystems: [],
  },
  {
    key: "orchestrator",
    label: "Orchestrator",
    stackPosition: 2,
    tokens:
      "Owns the loop that re-sends accumulating context — the root cause of token runaway.",
    errors: "Workflow-level failures; step explosions; non-terminating loops.",
    latency: "Total wall-clock is the sum of every iteration it drives.",
    patterns: [
      {
        title: "Reasoning loop",
        detail:
          "The agent revisits the same nodes/steps without converging. Detected from LangGraph node-revisit ratio and step depth (gen_ai.agent.iteration / langgraph_*).",
        tier: "live",
      },
      {
        title: "Within-trace token growth (scratchpad / history bloat)",
        detail:
          "Billable tokens climb iteration over iteration as the scratchpad and history are re-sent. Costed on billableTokens so a cached prefix is correctly seen as cheap.",
        tier: "live",
      },
    ],
    otel: "traceloop.workflow.name, traceloop.association.properties.langgraph_*, gen_ai.agent.iteration / max_iterations.",
    otelGap: false,
    relatedSpanKinds: ["workflow", "task"],
    relatedDbSystems: [],
  },
  {
    key: "agent",
    label: "Agent",
    stackPosition: 3,
    tokens: "Attributes token usage to a named agent via shared trace context.",
    errors: "Per-agent error rate; degradation trends; loop participation.",
    latency: "Per-agent P50/P90/P99 (and TTFT where emitted).",
    patterns: [
      {
        title: "High-frequency tool calls (N+1)",
        detail:
          "A single agent calls one tool far more than expected within a trace/timeframe — the AI analogue of an N+1 query. Detected from per-agent per-tool call counts.",
        tier: "live",
      },
      {
        title: "Agent error / degradation",
        detail:
          "Rising per-agent error rate or latency against its own trend.",
        tier: "live",
      },
    ],
    otel: "gen_ai.agent.name, gen_ai.agent.id, gen_ai.agent.iteration / max_iterations.",
    otelGap: false,
    relatedSpanKinds: ["agent"],
    relatedDbSystems: [],
  },
  {
    key: "tools",
    label: "Tools",
    stackPosition: 4,
    tokens: "Tool OUTPUT becomes the next LLM call's input — a token-bloat source.",
    errors: "Tool error % and retry storms (repeated failing calls).",
    latency: "Per-tool call time; slow tools dominate trace latency.",
    patterns: [
      {
        title: "Tool retry storm",
        detail:
          "A tool fails and is retried repeatedly within a trace, burning latency and tokens. Detected from tool error % and retry counts.",
        tier: "live",
      },
      {
        title: "Tool-output → token spike",
        detail:
          "A large tool result balloons the next LLM call's billable tokens. Attributed by correlating a tool span to the next LLM call in the trace.",
        tier: "live",
      },
      {
        title: "Parallel tool race conditions",
        detail:
          "Concurrent tools mutating shared state with order-dependent results. Not detectable from spans.",
        tier: "card",
      },
    ],
    otel: "gen_ai.tool.name, traceloop.span.kind == \"tool\", mcp.* (or mcp.server span name).",
    otelGap: false,
    relatedSpanKinds: ["tool"],
    relatedDbSystems: [],
  },
  {
    key: "llm",
    label: "LLM",
    stackPosition: 4,
    tokens:
      "Where tokens are billed: uncached input, cache-read, cache-write, output tiers.",
    errors:
      "Logical errors (refusal, content filter, max-token truncation), 429s, model fallback.",
    latency: "TTFT (streaming) + generation time; provider-side variance.",
    patterns: [
      {
        title: "Context-window exhaustion",
        detail:
          "Generation truncated for length (finish_reason \"max_tokens\"/\"length\"). Detected from gen_ai.response.finish_reasons.",
        tier: "live",
      },
      {
        title: "Logical errors",
        detail:
          "Refusals and content-filter blocks return HTTP 200 but no useful answer. Detected from finish_reasons / error fields.",
        tier: "live",
      },
      {
        title: "TTFT degradation",
        detail:
          "Streaming time-to-first-token regresses against its rolling baseline. Capability-gated on gen_ai.usage.time_to_first_token.",
        tier: "live",
      },
      {
        title: "Model fallback / request-vs-response mismatch",
        detail:
          "Provider served a different model than requested (gen_ai.request.model != gen_ai.response.model), after version-suffix normalization.",
        tier: "live",
      },
      {
        title: "Provider rate-limit / backoff",
        detail:
          "429/throttling with growing inter-attempt gaps (exponential backoff) at the LLM boundary.",
        tier: "live",
      },
      {
        title: "Retrieval hallucination",
        detail:
          "Ungrounded output despite retrieved context. Detectable only when an evaluator emits gen_ai.evaluation.* (groundedness/hallucination) — else card-only.",
        tier: "enrichment",
      },
    ],
    otel: "gen_ai.request/response.model, gen_ai.usage.* (input/output/cache tokens, cost, ttft), gen_ai.response.finish_reasons.",
    otelGap: false,
    relatedSpanKinds: ["llm"],
    relatedDbSystems: [],
  },
  {
    key: "vectordb",
    label: "Vector DB / RAG",
    stackPosition: 5,
    tokens: "Retrieved chunks become LLM input tokens; over-retrieval inflates cost.",
    errors: "Empty/low-relevance results; retrieval scope errors.",
    latency: "Retrieval latency; top-k and index size dependent.",
    patterns: [
      {
        title: "Top-K over-retrieval",
        detail:
          "An oversized top-k pulls more chunks than needed, inflating input tokens and cost. Detected from vector_db.query.top_k where emitted.",
        tier: "live",
      },
      {
        title: "Missing metadata-filter scope errors",
        detail:
          "Retrieval without the right metadata filter returns out-of-scope documents. Not reliably detectable from spans.",
        tier: "card",
      },
      {
        title: "Embedding-model mismatch",
        detail:
          "Query embedded with a different model than the index was built with, silently degrading recall. Not detectable from spans.",
        tier: "card",
      },
    ],
    otel: "db.system (a dedicated vector store value, e.g. pinecone), vector_db.query.text / results / top_k.",
    otelGap: false,
    relatedSpanKinds: ["task"],
    relatedDbSystems: [
      "pinecone",
      "qdrant",
      "chroma",
      "weaviate",
      "milvus",
      "pgvector",
    ],
  },
  {
    key: "memory",
    label: "Memory / State",
    stackPosition: 5,
    tokens: "Re-loaded conversation history is re-sent as input tokens each turn.",
    errors: "Stale or lost state; conflicting concurrent writes.",
    latency: "State-store read/write latency; grows with history size.",
    patterns: [
      {
        title: "History growth",
        detail:
          "Conversation/thread state grows unbounded, re-sent every turn — a steady upstream driver of token cost. Detected where conversation/thread identifiers are emitted.",
        tier: "live",
      },
      {
        title: "Stale-TTL context loss",
        detail:
          "State expires mid-conversation, so the agent loses context and repeats work. Not detectable from spans.",
        tier: "card",
      },
      {
        title: "Multi-agent state write conflicts",
        detail:
          "Concurrent agents write conflicting state; last-writer-wins corrupts shared memory. Not detectable from spans.",
        tier: "card",
      },
    ],
    otel: "gen_ai.conversation.id, traceloop.association.properties.thread_id / langgraph_checkpoint_ns.",
    otelGap: false,
    relatedSpanKinds: ["task"],
    relatedDbSystems: ["redis", "mongodb", "dynamodb"],
  },
];

/** Lookup by key. */
export const layerByKey = (key: LayerKey): AiLayer =>
  AI_LAYERS.find((l) => l.key === key) as AiLayer;

/** Layers grouped by stackPosition, in render order (rows of the schematic). */
export const layerRows = (): AiLayer[][] => {
  const byPos = new Map<number, AiLayer[]>();
  for (const l of AI_LAYERS) {
    const row = byPos.get(l.stackPosition) ?? [];
    row.push(l);
    byPos.set(l.stackPosition, row);
  }
  return Array.from(byPos.keys())
    .sort((a, b) => a - b)
    .map((p) => byPos.get(p) as AiLayer[]);
};

/**
 * AAA (AI Attribute Audit) — coverage catalog.
 *
 * Mirrors the 10 category sections of the AI Observability Attribute Coverage
 * notebook, which in turn mirrors the appendix of the AI Observability 3.0
 * Telemetry document. Each section lists every attribute
 * the observability app wants the AI workload to emit, what that attribute
 * buys you, and a `expr` predicate used to count how many spans carry it.
 *
 * The page renders these grouped into best-practice pillars (see GROUPS).
 * Span counts and present/missing verdicts come from live DQL — see
 * queries.ts (one query per section) and useAttributeAudit.ts.
 *
 * `expr` is a DQL boolean tested with countIf(...). Attribute names that have
 * dotted segments are back-ticked so the DQL parser treats them as a single
 * field path. Some attributes accept more than one spelling (newer vs. older
 * convention) and OR several isNotNull() checks together — that is intentional
 * and matches the source notebook.
 *
 * Tier definitions:
 *   A (Mandatory):      Core AI observability breaks without these — model/provider
 *                       attribution, token economics for cost tracking, error detection,
 *                       finish reason classification.
 *   B (Important):      Enables key Dynatrace dashboards and analytics — streaming
 *                       performance, cache economics, agent/tool attribution, session
 *                       stitching, reasoning tokens, workflow naming.
 *   C (Nice to Have):   Deep debugging or specialized use cases — sampling
 *                       hyperparameters, evaluation scores, PII/guardrails for
 *                       compliance-specific deployments, LangGraph graph metadata,
 *                       raw retrieval params.
 *   D (Unnecessary / Noise): Deprecated patterns, content capture anti-patterns
 *                       (PII risk + storage bloat), non-standard internals with no
 *                       spec backing. Opt-In only or migrate away.
 */

/** Tier classification for an attribute. */
export type AttrTier = "A" | "B" | "C" | "D";

/** A community-discovered attribute not yet in the main audit catalog. */
export interface CommunityAttr {
  name: string;
  what: string;
  tier: AttrTier;
  source: string;
  sourceUrl: string;
  sectionHint: string;
  why: string;
}

export interface AttrSpec {
  /** DQL boolean predicate, tested with countIf(...). */
  expr: string;
  /** Display name (the attribute path, or a friendly group label). */
  name: string;
  /** One-line explanation of what the attribute buys you. */
  what: string;
  /** Tier classification: A (Mandatory) → D (Unnecessary / Noise). */
  tier: AttrTier;
  /** Canonical replacement attribute name (when this attribute is deprecated). */
  deprecated?: string;
  /** True when this attribute was added in the OTel GenAI spec 2024–2025 wave. */
  specNew?: boolean;
}

export interface SpecLink {
  label: string;
  url: string;
}

/** Icon keys resolved to Strato icons in the page component. */
export type SectionIconKey =
  | "llm"
  | "agent"
  | "tools"
  | "workflow"
  | "langgraph"
  | "mcp"
  | "evaluation"
  | "session"
  | "vectordb"
  | "infra";

export interface AuditSection {
  id: string;
  /** 1..10, matching the notebook's "Section N" headers. */
  number: number;
  /** Full title, e.g. "LLM / inference (gen_ai.*)". */
  title: string;
  /** Short title for compact headers and the table of contents. */
  short: string;
  /** Why this category matters for AI observability. */
  blurb: string;
  iconKey: SectionIconKey;
  /**
   * DQL predicate (the bit after `| filter`) that selects the section's span
   * population — the denominator the attribute counts are measured against.
   */
  population: string;
  /**
   * When true, this section's population is EXCLUDED from the "AI spans in
   * window" estimate (the max-population figure). Set on Infrastructure, whose
   * population rides on platform attributes present on non-AI spans; the
   * AI-specific spans it does hold are already counted by another section's
   * population, so nothing AI-specific is lost by excluding it.
   */
  excludeFromSpanEstimate?: boolean;
  /** Spec / best-practice links for the whole section. */
  links: SpecLink[];
  attributes: AttrSpec[];
}

export interface AuditGroup {
  id: string;
  /** Pillar title. */
  title: string;
  /** Pillar rationale. */
  blurb: string;
  /** Section ids, in render order. */
  sectionIds: string[];
}

const OTEL_GENAI =
  "https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/";
const OTEL_GENAI_SPANS =
  "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/";
const OTEL_GENAI_AGENT_SPANS =
  "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/";
const TRACELOOP =
  "https://www.traceloop.com/docs/openllmetry/contributing/semantic-conventions";
const OTEL_MCP =
  "https://opentelemetry.io/docs/specs/semconv/registry/attributes/mcp/";
const OTEL_DB =
  "https://opentelemetry.io/docs/specs/semconv/registry/attributes/db/";
const OTEL_SESSION =
  "https://opentelemetry.io/docs/specs/semconv/registry/attributes/session/";
const OTEL_SERVICE =
  "https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/";
const OTEL_K8S =
  "https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/";

/** Helper to keep attribute literals terse. */
const nn = (path: string): string => `isNotNull(\`${path}\`)`;
const either = (...paths: string[]): string => paths.map(nn).join(" or ");

export const SECTIONS: AuditSection[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Section 1 — LLM / inference
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "llm",
    number: 1,
    title: "LLM / inference (gen_ai.*)",
    short: "LLM / inference",
    blurb:
      "The foundation of AI observability: every model call's provider, parameters, token economics, latency, content, and safety signals. Without these you cannot attribute cost, latency, or quality to a model.",
    iconKey: "llm",
    population: either("gen_ai.request.model", "gen_ai.operation.name"),
    links: [
      { label: "OTel GenAI attributes", url: OTEL_GENAI },
      { label: "OTel GenAI spans", url: OTEL_GENAI_SPANS },
    ],
    attributes: [
      // ── Tier A — Mandatory ────────────────────────────────────────────────
      { tier: "A", expr: nn("gen_ai.provider.name"), name: "gen_ai.provider.name", what: "LLM provider (canonical replacement for gen_ai.system)" },
      { tier: "A", expr: nn("gen_ai.system"), name: "gen_ai.system", what: "Older provider name (LangChain) — keep for compat; Dynatrace AI span filter uses this", deprecated: "gen_ai.provider.name" },
      { tier: "A", expr: nn("gen_ai.operation.name"), name: "gen_ai.operation.name", what: "Call type: chat / text_completion / embedding" },
      { tier: "A", expr: nn("gen_ai.request.model"), name: "gen_ai.request.model", what: "Model requested by caller" },
      { tier: "A", expr: nn("gen_ai.response.model"), name: "gen_ai.response.model", what: "Model the provider actually used" },
      { tier: "A", expr: either("gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens"), name: "gen_ai.usage.input_tokens", what: "Input / prompt token count. Also checks gen_ai.usage.prompt_tokens (OpenLLMetry wire name pre-v0.48.0)" },
      { tier: "A", expr: either("gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens"), name: "gen_ai.usage.output_tokens", what: "Output / completion token count. Also checks gen_ai.usage.completion_tokens (OpenLLMetry wire name pre-v0.48.0)" },
      { tier: "A", expr: either("gen_ai.response.finish_reasons", "gen_ai.response.finish_reason"), name: "gen_ai.response.finish_reasons", what: "Why the model stopped. Also checks singular gen_ai.response.finish_reason (still emitted by some OpenLLMetry versions)" },
      { tier: "A", expr: nn("gen_ai.error.code"), name: "gen_ai.error.code", what: "Provider error code" },
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("gen_ai.request.temperature"), name: "gen_ai.request.temperature", what: "Sampling temperature" },
      { tier: "B", expr: nn("gen_ai.request.max_tokens"), name: "gen_ai.request.max_tokens", what: "Max tokens requested" },
      { tier: "B", expr: nn("gen_ai.request.top_p"), name: "gen_ai.request.top_p", what: "Top-p nucleus sampling" },
      { tier: "B", specNew: true, expr: nn("gen_ai.request.top_k"), name: "gen_ai.request.top_k", what: "Top-k sampling — limits token candidates per step; Conditionally Required in new spec" },
      { tier: "B", expr: nn("gen_ai.request.stop_sequences"), name: "gen_ai.request.stop_sequences", what: "Stop sequence tokens" },
      { tier: "B", expr: nn("gen_ai.request.frequency_penalty"), name: "gen_ai.request.frequency_penalty", what: "Frequency penalty" },
      { tier: "B", expr: nn("gen_ai.request.presence_penalty"), name: "gen_ai.request.presence_penalty", what: "Presence penalty" },
      { tier: "B", expr: nn("gen_ai.request.seed"), name: "gen_ai.request.seed", what: "Reproducibility seed" },
      { tier: "B", specNew: true, expr: nn("gen_ai.request.choice.count"), name: "gen_ai.request.choice.count", what: "Number of candidate completions requested (the n parameter); each multiplies token cost" },
      { tier: "B", specNew: true, expr: nn("gen_ai.request.reasoning.level"), name: "gen_ai.request.reasoning.level", what: "Reasoning effort for chain-of-thought models (low / medium / high); controls hidden reasoning token spend" },
      { tier: "B", expr: nn("gen_ai.request.is_stream"), name: "gen_ai.request.is_stream", what: "Whether the response was streamed (legacy spelling)", deprecated: "gen_ai.request.stream" },
      { tier: "B", specNew: true, expr: either("gen_ai.request.stream", "gen_ai.is_streaming"), name: "gen_ai.request.stream", what: "Whether the request uses streaming — canonical replacement. Also checks gen_ai.is_streaming (OpenLLMetry wire name)" },
      { tier: "B", expr: nn("gen_ai.response.id"), name: "gen_ai.response.id", what: "Provider-assigned response id" },
      { tier: "B", expr: either("gen_ai.response.ttft", "gen_ai.response.time_to_first_chunk"), name: "gen_ai.response.ttft / time_to_first_chunk", what: "Time-to-first-token (streaming latency)" },
      { tier: "B", specNew: true, expr: either("gen_ai.output.type", "gen_ai.request.response_format"), name: "gen_ai.output.type", what: "Output modality: text / json / image / speech; Conditionally Required; replaces gen_ai.request.response_format" },
      { tier: "B", expr: nn("gen_ai.usage.cached_tokens"), name: "gen_ai.usage.cached_tokens", what: "Tokens served from prompt cache (legacy spelling)", deprecated: "gen_ai.usage.cache_read.input_tokens" },
      { tier: "B", specNew: true, expr: either("gen_ai.usage.cache_read.input_tokens", "gen_ai.usage.cache_read_input_tokens"), name: "gen_ai.usage.cache_read.input_tokens", what: "Prompt-cache hit tokens — cheaper than fresh input tokens; canonical replacement for gen_ai.usage.cached_tokens. Also checks underscore form (gen_ai.usage.cache_read_input_tokens) emitted by older OpenLLMetry" },
      { tier: "B", expr: nn("gen_ai.usage.cache_creation_input_tokens"), name: "gen_ai.usage.cache_creation_input_tokens", what: "Tokens written to prompt cache (legacy spelling)", deprecated: "gen_ai.usage.cache_creation.input_tokens" },
      { tier: "B", specNew: true, expr: either("gen_ai.usage.cache_creation.input_tokens", "gen_ai.usage.cache_creation_input_tokens"), name: "gen_ai.usage.cache_creation.input_tokens", what: "Tokens written to prompt cache at higher cost; canonical replacement. Also checks underscore form (gen_ai.usage.cache_creation_input_tokens) emitted by older OpenLLMetry" },
      { tier: "B", specNew: true, expr: either("gen_ai.usage.reasoning.output_tokens", "gen_ai.usage.reasoning_tokens"), name: "gen_ai.usage.reasoning.output_tokens", what: "Chain-of-thought / extended-thinking tokens (o1, o3, Claude 3.7+); billable but not visible in output — a cost blindspot without this. Also checks gen_ai.usage.reasoning_tokens (OpenLLMetry wire name)" },
      { tier: "B", expr: nn("gen_ai.error.message"), name: "gen_ai.error.message", what: "Provider error message" },
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", expr: nn("gen_ai.request.response_format"), name: "gen_ai.request.response_format", what: "Requested response format (superseded by gen_ai.output.type)", deprecated: "gen_ai.output.type" },
      { tier: "C", expr: nn("gen_ai.request.context_utilization"), name: "gen_ai.request.context_utilization", what: "Context window utilization" },
      { tier: "C", expr: nn("gen_ai.request.retry_count"), name: "gen_ai.request.retry_count", what: "Retry count" },
      { tier: "C", expr: nn("gen_ai.response.chunk_count"), name: "gen_ai.response.chunk_count", what: "Streamed chunk count" },
      { tier: "C", expr: nn("gen_ai.response.logprobs"), name: "gen_ai.response.logprobs", what: "Token log-probabilities" },
      { tier: "C", expr: nn("gen_ai.usage.total_tokens"), name: "gen_ai.usage.total_tokens", what: "Sum of input + output — NOT in OTel spec; derived from input+output; keep for legacy compat" },
      { tier: "C", expr: nn("gen_ai.usage.cost"), name: "gen_ai.usage.cost", what: "DOES NOT EXIST in any spec version (OTel issue #1042, open since May 2024). Never implemented. If present on your spans, it was added by custom instrumentation." },
      { tier: "C", expr: nn("gen_ai.client.token.usage"), name: "gen_ai.client.token.usage", what: "OTel GenAI token histogram metric — correctly a Histogram METRIC instrument, not a span attribute; keep for awareness" },
      { tier: "C", expr: nn("gen_ai.cached_response"), name: "gen_ai.cached_response", what: "Whether the response was cache-served" },
      { tier: "C", specNew: true, expr: nn("gen_ai.conversation.compacted"), name: "gen_ai.conversation.compacted", what: "Whether the conversation context was summarized/truncated to fit the context window" },
      { tier: "C", expr: nn("gen_ai.user"), name: "gen_ai.user", what: "User identifier" },
      { tier: "C", expr: nn("gen_ai.system_instructions"), name: "gen_ai.system_instructions", what: "System prompt / system message" },
      { tier: "C", expr: either("gen_ai.feedback.rating", "gen_ai.feedback.label"), name: "gen_ai.feedback.rating / label", what: "Captured user feedback" },
      { tier: "C", expr: nn("gen_ai.privacy.pii_detected"), name: "gen_ai.privacy.pii_detected", what: "Whether PII was found in prompt/response" },
      { tier: "C", expr: nn("gen_ai.privacy.pii_categories"), name: "gen_ai.privacy.pii_categories", what: "Which PII categories were detected" },
      { tier: "C", expr: either("gen_ai.request.guardrail_id", "gen_ai.response.guardrail_action"), name: "gen_ai.request.guardrail_id / response.guardrail_action", what: "Bedrock guardrail id / outcome" },
      // ── Tier D — Unnecessary / Noise ─────────────────────────────────────
      { tier: "D", expr: nn("gen_ai.response.tool_calls"), name: "gen_ai.response.tool_calls", what: "Anti-pattern: use child spans with gen_ai.tool.call.id instead" },
      { tier: "D", expr: nn("gen_ai.response.warning"), name: "gen_ai.response.warning", what: "SDK warning flag" },
      { tier: "D", expr: nn("gen_ai.prompt.0.content"), name: "gen_ai.prompt.0.content", what: "Actual prompt text (old OpenLLMetry indexed form; PII risk)", deprecated: "gen_ai.input.messages" },
      { tier: "D", expr: nn("gen_ai.input.messages"), name: "gen_ai.input.messages", what: "Input messages array (Opt-In only; raw content is a security anti-pattern in production)" },
      { tier: "D", expr: nn("gen_ai.completion.0.content"), name: "gen_ai.completion.0.content", what: "Actual response text (old OpenLLMetry indexed form)", deprecated: "gen_ai.output.messages" },
      { tier: "D", expr: nn("gen_ai.output.messages"), name: "gen_ai.output.messages", what: "Output messages array (Opt-In only; same caveats as input.messages)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 2 — Agent
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "agent",
    number: 2,
    title: "Agent (gen_ai.agent.*)",
    short: "Agent",
    blurb:
      "Identifies the autonomous agent behind a span and how it loops. Required to attribute behaviour, cost, and reliability to a specific agent and to detect runaway iteration. Also covers memory operations — the gen_ai.memory.* attributes track reads and writes to persistent agent memory stores.",
    iconKey: "agent",
    population: either("gen_ai.agent.name", "gen_ai.request.model"),
    links: [
      { label: "OTel GenAI agent attributes", url: OTEL_GENAI },
      { label: "OTel GenAI agent spans", url: OTEL_GENAI_AGENT_SPANS },
    ],
    attributes: [
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("gen_ai.agent.name"), name: "gen_ai.agent.name", what: "Agent identifier / name" },
      { tier: "B", specNew: true, expr: nn("gen_ai.agent.id"), name: "gen_ai.agent.id", what: "Provider-assigned stable agent identifier (e.g. AWS Agent ARN); Conditionally Required; enables cross-request agent attribution" },
      { tier: "B", specNew: true, expr: nn("gen_ai.agent.version"), name: "gen_ai.agent.version", what: "Agent version string; Conditionally Required; critical for A/B testing agent prompt or logic versions" },
      { tier: "B", expr: nn("gen_ai.agent.description"), name: "gen_ai.agent.description", what: "Human-readable agent purpose" },
      { tier: "B", specNew: true, expr: either("gen_ai.workflow.name", "traceloop.workflow.name"), name: "gen_ai.workflow.name", what: "Official OTel workflow name for invoke_workflow spans; converging replacement for traceloop.workflow.name" },
      { tier: "B", specNew: true, expr: nn("gen_ai.memory.store.id"), name: "gen_ai.memory.store.id", what: "Identifier for the persistent memory store used by stateful agents; Conditionally Required on memory operation spans" },
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", expr: nn("gen_ai.agent.type"), name: "gen_ai.agent.type", what: "Architecture type (react, plan-and-execute)" },
      { tier: "C", expr: nn("gen_ai.agent.iteration"), name: "gen_ai.agent.iteration", what: "Current agent-loop iteration" },
      { tier: "C", expr: nn("gen_ai.agent.max_iterations"), name: "gen_ai.agent.max_iterations", what: "Configured loop ceiling" },
      { tier: "C", specNew: true, expr: nn("gen_ai.memory.record.count"), name: "gen_ai.memory.record.count", what: "Number of memory records retrieved or created; Recommended on memory spans" },
      { tier: "C", specNew: true, expr: nn("gen_ai.memory.query.text"), name: "gen_ai.memory.query.text", what: "Semantic search query sent to the memory store (Opt-In); enables memory retrieval analysis" },
      // ── Tier D — Unnecessary / Noise ─────────────────────────────────────
      { tier: "D", specNew: true, expr: nn("gen_ai.memory.records"), name: "gen_ai.memory.records", what: "Full memory record payload (Opt-In, sensitive); high PII and storage risk — reference pointer preferred" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 3 — Tool calls
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "tools",
    number: 3,
    title: "Tool calls (gen_ai.tool.*)",
    short: "Tool calls",
    blurb:
      "The standard GenAI tool-call attributes. When present they let you analyse which tools an agent invokes, correlate calls to results, and surface failing tools independent of the Traceloop spelling.",
    iconKey: "tools",
    population: either("gen_ai.request.model", "traceloop.span.kind"),
    links: [
      { label: "OTel GenAI attributes", url: OTEL_GENAI },
      { label: "OTel GenAI spans", url: OTEL_GENAI_SPANS },
    ],
    attributes: [
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("gen_ai.tool.name"), name: "gen_ai.tool.name", what: "Name of the tool being called" },
      { tier: "B", expr: nn("gen_ai.tool.call.id"), name: "gen_ai.tool.call.id", what: "Unique id for a tool-call invocation" },
      { tier: "B", expr: nn("gen_ai.tool.description"), name: "gen_ai.tool.description", what: "Tool description passed to the model" },
      { tier: "B", specNew: true, expr: nn("gen_ai.tool.type"), name: "gen_ai.tool.type", what: "Tool category: function (client-side), extension (agent-side API call), datastore (structured/unstructured data access)" },
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", specNew: true, expr: nn("gen_ai.tool.call.arguments"), name: "gen_ai.tool.call.arguments", what: "Structured arguments passed to the tool (Opt-In); high value for debugging tool failures but requires PII governance" },
      { tier: "C", specNew: true, expr: nn("gen_ai.tool.call.result"), name: "gen_ai.tool.call.result", what: "Structured result returned by the tool (Opt-In); essential for debugging incorrect tool outputs" },
      // ── Tier D — Unnecessary / Noise ─────────────────────────────────────
      { tier: "D", specNew: true, expr: nn("gen_ai.tool.definitions"), name: "gen_ai.tool.definitions", what: "Full list of tool definitions available to the model (Opt-In); very verbose, low additional value over gen_ai.tool.name" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 4 — Traceloop / OpenLLMetry workflow
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "traceloop",
    number: 4,
    title: "Traceloop / OpenLLMetry workflow",
    short: "Traceloop workflow",
    blurb:
      "OpenLLMetry's workflow/task/tool span hierarchy. These attributes give the end-to-end trace shape — enclosing workflow, entity inputs/outputs, and span kind — that ties individual LLM calls into a coherent agent run. NOTE: OpenLLMetry is converging toward the OTel GenAI spec. These attributes remain widely emitted but have official OTel replacements (gen_ai.workflow.name, gen_ai.agent.name, gen_ai.input.messages, etc.).",
    iconKey: "workflow",
    population: either("traceloop.span.kind", "traceloop.workflow.name", "traceloop.entity.name"),
    links: [{ label: "OpenLLMetry semantic conventions", url: TRACELOOP }],
    attributes: [
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("traceloop.span.kind"), name: "traceloop.span.kind", what: "De-facto span classifier in OpenLLMetry; values: llm / workflow / task / tool / agent" },
      { tier: "B", expr: nn("traceloop.workflow.name"), name: "traceloop.workflow.name", what: "Enclosing workflow (e.g. *.mcp) — superseded by gen_ai.workflow.name but widely emitted" },
      { tier: "B", expr: nn("traceloop.entity.name"), name: "traceloop.entity.name", what: "Current task / tool entity — superseded by gen_ai.agent.name for agent spans, but widely emitted" },
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", expr: nn("traceloop.entity.path"), name: "traceloop.entity.path", what: "Dot-notation path of nested entities" },
      // ── Tier D — Unnecessary / Noise ─────────────────────────────────────
      { tier: "D", expr: nn("traceloop.entity.input"), name: "traceloop.entity.input", what: "Serialized input to the tool / task — superseded by gen_ai.input.messages; opt-in content capture" },
      { tier: "D", expr: nn("traceloop.entity.output"), name: "traceloop.entity.output", what: "Serialized output from the tool / task — superseded by gen_ai.output.messages; opt-in content capture" },
      { tier: "D", expr: either("traceloop.association.properties.langgraph_node", "traceloop.association.properties.thread_id"), name: "traceloop.association.properties.* (sampled keys)", what: "Wildcard custom bag — high cardinality anti-pattern; use specific named attributes instead" },
      { tier: "D", expr: nn("traceloop.prompt_managed_prompts.name"), name: "traceloop.prompt_managed_prompts.name", what: "Identifier for a Traceloop-registry prompt — Traceloop ecosystem-specific; rarely used outside their platform" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 5 — LangGraph
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "langgraph",
    number: 5,
    title: "LangGraph (traceloop.association.properties.langgraph_*)",
    short: "LangGraph",
    blurb:
      "Graph-execution detail emitted by LangGraph through Traceloop association properties. These have no OTel spec backing and should be mapped to standard attributes. All attributes in this section are Tier D — migrate to OTel equivalents: use gen_ai.agent.name instead of langgraph_node, gen_ai.agent.iteration instead of langgraph_step, and gen_ai.conversation.id instead of thread_id / langgraph_run_id.",
    iconKey: "langgraph",
    population: either(
      "traceloop.association.properties.langgraph_node",
      "traceloop.association.properties.langgraph_step",
      "traceloop.association.properties.thread_id",
    ),
    links: [{ label: "OpenLLMetry semantic conventions", url: TRACELOOP }],
    attributes: [
      // ── Tier D — all LangGraph association properties are non-standard ─────
      { tier: "D", expr: nn("traceloop.association.properties.langgraph_node"), name: "langgraph_node", what: "The node that emitted the span", deprecated: "gen_ai.agent.name" },
      { tier: "D", expr: nn("traceloop.association.properties.langgraph_checkpoint_ns"), name: "langgraph_checkpoint_ns", what: "Checkpoint namespace (graph execution instance) — no standard equivalent; internal LangGraph execution bookkeeping" },
      { tier: "D", expr: nn("traceloop.association.properties.langgraph_step"), name: "langgraph_step", what: "Execution step number within the graph", deprecated: "gen_ai.agent.iteration" },
      { tier: "D", expr: nn("traceloop.association.properties.langgraph_triggers"), name: "langgraph_triggers", what: "Which edges/conditions triggered this node — no standard equivalent" },
      { tier: "D", expr: nn("traceloop.association.properties.langgraph_path"), name: "langgraph_path", what: "Full path through the graph to this node — no standard equivalent" },
      { tier: "D", expr: nn("traceloop.association.properties.thread_id"), name: "thread_id", what: "Conversation thread across graph runs", deprecated: "gen_ai.conversation.id" },
      { tier: "D", expr: nn("traceloop.association.properties.langgraph_task_idx"), name: "langgraph_task_idx", what: "Task index for parallel node execution — no standard equivalent" },
      { tier: "D", expr: nn("traceloop.association.properties.langgraph_run_id"), name: "langgraph_run_id", what: "Graph run identifier — redundant with OTel trace ID", deprecated: "gen_ai.conversation.id" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 6 — MCP protocol
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "mcp",
    number: 6,
    title: "MCP protocol (mcp.*)",
    short: "MCP protocol",
    blurb:
      "OpenTelemetry's Model Context Protocol attributes. When emitted they give first-class visibility into MCP servers, methods, sessions, and errors — instead of inferring tool health from generic Traceloop spans.",
    iconKey: "mcp",
    population: either("mcp.response.value", "mcp.method.name", "traceloop.span.kind"),
    links: [{ label: "OTel MCP attributes", url: OTEL_MCP }],
    attributes: [
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("mcp.method.name"), name: "mcp.method.name", what: "RPC method: initialize / tools/call / tools/list" },
      { tier: "B", expr: nn("mcp.session.id"), name: "mcp.session.id", what: "Unique MCP session identifier" },
      { tier: "B", expr: nn("mcp.is_error"), name: "mcp.is_error", what: "Explicit boolean error flag on MCP spans" },
      { tier: "B", expr: nn("mcp.server.name"), name: "mcp.server.name", what: "Canonical MCP server identifier" },
      { tier: "B", specNew: true, expr: nn("mcp.protocol.version"), name: "mcp.protocol.version", what: "MCP protocol version string (e.g. 2025-03-26); important for debugging MCP compatibility across client/server versions" },
      { tier: "B", specNew: true, expr: nn("mcp.resource.uri"), name: "mcp.resource.uri", what: "URI of the MCP resource being accessed (e.g. resource://file.txt); Conditionally Required on resource read/subscribe spans" },
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", expr: nn("mcp.client.name"), name: "mcp.client.name", what: "Calling MCP client identifier" },
      { tier: "C", expr: nn("mcp.response.value"), name: "mcp.response.value", what: "Full MCP tool result JSON" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 7 — Evaluation & quality
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "evaluation",
    number: 7,
    title: "Evaluation & quality",
    short: "Evaluation & quality",
    blurb:
      "Per-response quality scores and prompt-version identifiers. These turn AI observability from 'is it up?' into 'is it good?' — tracking hallucination, faithfulness, and relevance against prompt versions. NOTE: the named evaluation attributes (hallucination, correctness, etc.) are NOT in the OTel spec by those exact names. The spec uses gen_ai.evaluation.name + gen_ai.evaluation.score.value as generic scaffolding.",
    iconKey: "evaluation",
    population: either("gen_ai.request.model", "gen_ai.evaluation.score"),
    links: [
      { label: "OpenLLMetry semantic conventions", url: TRACELOOP },
      { label: "OTel GenAI attributes", url: OTEL_GENAI },
    ],
    attributes: [
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", expr: nn("gen_ai.evaluation.hallucination"), name: "gen_ai.evaluation.hallucination", what: "Hallucination score (0-1) — NOT in OTel spec by this name; the spec pattern is gen_ai.evaluation.name=hallucination + gen_ai.evaluation.score.value" },
      { tier: "C", expr: nn("gen_ai.evaluation.correctness"), name: "gen_ai.evaluation.correctness", what: "Factual correctness score — same note: not in OTel spec by this name" },
      { tier: "C", expr: nn("gen_ai.evaluation.faithfulness"), name: "gen_ai.evaluation.faithfulness", what: "RAG faithfulness (grounded in retrieved docs) — not in OTel spec by this name" },
      { tier: "C", expr: nn("gen_ai.evaluation.relevance"), name: "gen_ai.evaluation.relevance", what: "Response relevance score — not in OTel spec by this name" },
      { tier: "C", expr: either("gen_ai.evaluation.score", "gen_ai.evaluation.overall_score"), name: "gen_ai.evaluation.score / overall_score", what: "Composite / weighted eval score", deprecated: "gen_ai.evaluation.score.value" },
      { tier: "C", specNew: true, expr: nn("gen_ai.evaluation.name"), name: "gen_ai.evaluation.name", what: "OTel-spec evaluator name (e.g. relevance, faithfulness); the generic equivalent of the custom named evaluation attributes" },
      { tier: "C", specNew: true, expr: either("gen_ai.evaluation.score.value", "gen_ai.evaluation.score"), name: "gen_ai.evaluation.score.value", what: "Numeric evaluation score (0–1); canonical OTel replacement for gen_ai.evaluation.score" },
      { tier: "C", specNew: true, expr: nn("gen_ai.evaluation.score.label"), name: "gen_ai.evaluation.score.label", what: "Human-readable score interpretation (e.g. pass / fail / relevant); part of the OTel evaluation event spec" },
      { tier: "C", expr: either("gen_ai.prompt_hub.name", "gen_ai.prompt_hub.version"), name: "gen_ai.prompt_hub.name / version", what: "Prompt version identifier" },
      // ── Tier D — Unnecessary / Noise ─────────────────────────────────────
      { tier: "D", specNew: true, expr: nn("gen_ai.evaluation.explanation"), name: "gen_ai.evaluation.explanation", what: "Judge's text explanation for the evaluation score; Opt-In; useful for human review but too verbose for dashboards" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 8 — Session, user & context
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "session",
    number: 8,
    title: "Session, user & context",
    short: "Session & user",
    blurb:
      "The identifiers that stitch individual spans into conversations, users, and front-end sessions. Without them you cannot follow a multi-turn dialogue or link a model call back to the originating RUM session.",
    iconKey: "session",
    population: either("gen_ai.request.model", "session.id", "gen_ai.conversation.id", "dt.rum.session.id"),
    links: [
      { label: "OTel session attributes", url: OTEL_SESSION },
      { label: "OTel GenAI attributes", url: OTEL_GENAI },
    ],
    attributes: [
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("session.id"), name: "session.id", what: "Application session identifier" },
      { tier: "B", expr: nn("gen_ai.conversation.id"), name: "gen_ai.conversation.id", what: "Multi-turn conversation thread id" },
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", expr: nn("gen_ai.user"), name: "gen_ai.user", what: "User identifier (also tracked in LLM section)" },
      { tier: "C", expr: nn("dt.rum.session.id"), name: "dt.rum.session.id", what: "Dynatrace RUM session id (front-to-back link)" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 9 — Vector database & Retrieval (RAG)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "vectordb",
    number: 9,
    title: "Vector database & Retrieval (RAG)",
    short: "Vector DB & RAG",
    blurb:
      "Retrieval-augmented generation telemetry: the vector store, the query, the returned chunks, and embedding dimensionality. The OTel spec has added gen_ai.retrieval.* as the canonical namespace — vector_db.* attributes are now deprecated in favour of these. These explain why a model answered the way it did and where RAG quality breaks down.",
    iconKey: "vectordb",
    // NB: db.system is intentionally NOT in the population. It rides on every
    // ordinary database span (redis, postgres, …), not just vector stores, so
    // including it would count non-AI DB traffic as RAG spans and inflate the
    // "AI spans in window" estimate. db.system remains a measured attribute
    // below — its presence still counts, it just doesn't define the population.
    population: either("vector_db.query.text", "gen_ai.retrieval.query.text", "gen_ai.request.embedding_dimensions"),
    links: [
      { label: "OTel database attributes", url: OTEL_DB },
      { label: "OpenLLMetry semantic conventions", url: TRACELOOP },
    ],
    attributes: [
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("db.system"), name: "db.system", what: "Database system type (redis, milvus, postgres)" },
      { tier: "B", specNew: true, expr: nn("gen_ai.data_source.id"), name: "gen_ai.data_source.id", what: "Identifier for the external knowledge base / data source used in RAG retrieval; Conditionally Required on retrieval spans" },
      { tier: "B", specNew: true, expr: either("gen_ai.retrieval.query.text", "vector_db.query.text"), name: "gen_ai.retrieval.query.text", what: "Semantic search query sent to the retrieval system; OTel-canonical replacement for vector_db.query.text" },
      { tier: "B", specNew: true, expr: either("gen_ai.retrieval.top_k", "vector_db.query.top_k"), name: "gen_ai.retrieval.top_k", what: "Number of documents to retrieve; OTel-canonical replacement for vector_db.query.top_k" },
      // ── Tier C — Nice to Have ─────────────────────────────────────────────
      { tier: "C", specNew: true, expr: either("gen_ai.retrieval.documents", "vector_db.results"), name: "gen_ai.retrieval.documents", what: "Retrieved documents with relevance scores (Opt-In); OTel-canonical replacement for vector_db.results" },
      { tier: "C", specNew: true, expr: either("gen_ai.embeddings.dimension.count", "gen_ai.request.embedding_dimensions"), name: "gen_ai.embeddings.dimension.count", what: "Embedding vector dimensionality; OTel-canonical replacement for gen_ai.request.embedding_dimensions" },
      { tier: "C", specNew: true, expr: nn("gen_ai.request.encoding_formats"), name: "gen_ai.request.encoding_formats", what: "Embedding output format(s) requested (e.g. float, binary); Recommended on embeddings operation spans" },
      { tier: "C", expr: nn("gen_ai.request.embedding_dimensions"), name: "gen_ai.request.embedding_dimensions", what: "Embedding vector dimensionality (legacy spelling)", deprecated: "gen_ai.embeddings.dimension.count" },
      // ── Tier D — Deprecated / migrate away ───────────────────────────────
      { tier: "D", expr: nn("vector_db.query.text"), name: "vector_db.query.text", what: "Text query sent to the vector store (deprecated legacy spelling)", deprecated: "gen_ai.retrieval.query.text" },
      { tier: "D", expr: nn("vector_db.results"), name: "vector_db.results", what: "Retrieved documents / chunks (deprecated legacy spelling)", deprecated: "gen_ai.retrieval.documents" },
      { tier: "D", expr: nn("vector_db.query.top_k"), name: "vector_db.query.top_k", what: "Number of results requested (deprecated legacy spelling)", deprecated: "gen_ai.retrieval.top_k" },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Section 10 — Infrastructure / platform context
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "infra",
    number: 10,
    title: "Infrastructure / platform context",
    short: "Infrastructure",
    blurb:
      "Where the workload runs and the platform-level signals that surface failures. These connect AI spans to services, Kubernetes placement, hosts, and the HTTP/RPC/exception attributes Davis uses for problem detection.",
    iconKey: "infra",
    population: either("gen_ai.request.model", "traceloop.span.kind", "mcp.response.value"),
    // Platform/infrastructure spans overstate AI spans (service.name, host, HTTP
    // attributes ride on non-AI spans too), and the gen_ai.request.model spans
    // here are already counted by Section 1 — so keep this section out of the
    // "AI spans in window" estimate.
    excludeFromSpanEstimate: true,
    links: [
      { label: "OTel service attributes", url: OTEL_SERVICE },
      { label: "OTel Kubernetes attributes", url: OTEL_K8S },
    ],
    attributes: [
      // ── Tier A — Mandatory ────────────────────────────────────────────────
      { tier: "A", expr: nn("service.name"), name: "service.name", what: "Service / application name" },
      { tier: "A", expr: nn("exception.type"), name: "exception.type", what: "Exception class name" },
      { tier: "A", specNew: true, expr: nn("error.type"), name: "error.type", what: "OTel Stable attribute for exception class name — the stable, spec-compliant complement to exception.type for error classification and alerting" },
      // ── Tier B — Important ────────────────────────────────────────────────
      { tier: "B", expr: nn("dt.service.name"), name: "dt.service.name", what: "Dynatrace-resolved service name" },
      { tier: "B", expr: either("k8s.namespace.name", "k8s.cluster.name", "k8s.workload.name"), name: "k8s.namespace.name / cluster.name / workload.name", what: "Kubernetes placement" },
      { tier: "B", expr: nn("host.name"), name: "host.name", what: "Hostname" },
      { tier: "B", expr: nn("http.response.status_code"), name: "http.response.status_code", what: "HTTP status (error detection at >=400)" },
      { tier: "B", expr: nn("rpc.method"), name: "rpc.method", what: "RPC method (invokemodel, converse)" },
      { tier: "B", specNew: true, expr: nn("server.address"), name: "server.address", what: "AI provider API endpoint hostname (e.g. api.openai.com); OTel Stable attribute; enables provider endpoint monitoring and cost attribution by endpoint" },
    ],
  },
];

/**
 * Best-practice pillars. Every section appears in exactly one group; together
 * they cover all 10 notebook sections, ordered the way an AI-observability
 * maturity review reads: model core → orchestration → tools/protocol →
 * retrieval → quality/trust → platform.
 */
export const GROUPS: AuditGroup[] = [
  {
    id: "core",
    title: "Model & inference core",
    blurb:
      "The non-negotiable foundation — identity, parameters, token economics, content, and safety of every model call.",
    sectionIds: ["llm"],
  },
  {
    id: "orchestration",
    title: "Agentic orchestration",
    blurb:
      "How autonomous agents, workflows, and execution graphs are traced end to end.",
    sectionIds: ["agent", "traceloop", "langgraph"],
  },
  {
    id: "tools",
    title: "Tools & protocol",
    blurb:
      "External capability calls and the Model Context Protocol that brokers them.",
    sectionIds: ["tools", "mcp"],
  },
  {
    id: "retrieval",
    title: "Retrieval & memory",
    blurb: "Vector search and embeddings that ground responses (RAG).",
    sectionIds: ["vectordb"],
  },
  {
    id: "quality",
    title: "Quality, trust & context",
    blurb:
      "Evaluation scores, prompt governance, and the session/user context that ties turns together.",
    sectionIds: ["evaluation", "session"],
  },
  {
    id: "platform",
    title: "Platform & reliability",
    blurb:
      "Where the workload runs and the infra-level signals that surface failures.",
    sectionIds: ["infra"],
  },
];

export const SECTION_BY_ID: Record<string, AuditSection> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
);

/** Total attribute count across all sections (denominator for the hero KPI). */
export const TOTAL_ATTRIBUTES = SECTIONS.reduce(
  (sum, s) => sum + s.attributes.length,
  0,
);

// ─────────────────────────────────────────────────────────────────────────────
// Community / emerging attributes — not yet in the main audit catalog
// ─────────────────────────────────────────────────────────────────────────────

export const COMMUNITY_ATTRS: CommunityAttr[] = [
  // Emerging OTel GenAI spec attributes not yet in the audit catalog
  {
    name: "gen_ai.guardrail.id",
    what: "Identifier for the content guardrail applied to the request or response",
    tier: "C",
    source: "Dynatrace Semantic Dictionary",
    sourceUrl: "https://docs.dynatrace.com/docs/semantic-dictionary/",
    sectionHint: "LLM / inference",
    why: "Replaces the non-standard gen_ai.request.guardrail_id / gen_ai.response.guardrail_action pair with a single, stable identifier. Dynatrace natively supports this in the semantic dictionary.",
  },
  {
    name: "gen_ai.guardrail.version",
    what: "Version of the content guardrail policy applied",
    tier: "C",
    source: "Dynatrace Semantic Dictionary",
    sourceUrl: "https://docs.dynatrace.com/docs/semantic-dictionary/",
    sectionHint: "LLM / inference",
    why: "Enables guardrail policy regression tracking — essential when guardrail rules are versioned.",
  },
  {
    name: "gen_ai.prompt.name",
    what: "Name / identifier of the prompt template used for the request",
    tier: "B",
    source: "OTel GenAI Spec (Development)",
    sourceUrl: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/",
    sectionHint: "LLM / inference",
    why: "OTel-native replacement for traceloop.prompt_managed_prompts.name. Enables per-template cost and quality analytics — crucial for prompt A/B testing pipelines.",
  },
  {
    name: "gen_ai.token.type",
    what: "Dimension on the gen_ai.client.token.usage histogram metric indicating token category (input / output)",
    tier: "B",
    source: "OTel GenAI Metrics Spec",
    sourceUrl: "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/",
    sectionHint: "LLM / inference (Metrics)",
    why: "This is a METRIC dimension, not a span attribute. The gen_ai.client.token.usage histogram uses this to separate input and output token distributions — required for accurate cost dashboards when using OTel metrics alongside spans.",
  },
  {
    name: "gen_ai.memory.record.id",
    what: "Identifier of a specific memory record created or retrieved in a memory operation",
    tier: "C",
    source: "OTel GenAI Spec (Development)",
    sourceUrl: "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/",
    sectionHint: "Agent / Memory",
    why: "Enables precise correlation of memory reads and writes in stateful agent systems. Useful when debugging why an agent recalled the wrong context.",
  },
  {
    name: "gen_ai.memory.records",
    what: "Full memory record payload retrieved or written (Opt-In, sensitive)",
    tier: "D",
    source: "OTel GenAI Spec (Development, Opt-In)",
    sourceUrl: "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/",
    sectionHint: "Agent / Memory",
    why: "Opt-In only due to PII risk and storage cost. Useful in dev environments for debugging memory content but should never be enabled in production without PII scrubbing at the collector layer.",
  },
  {
    name: "server.port",
    what: "Network port of the AI provider API endpoint",
    tier: "C",
    source: "OTel Stable Conventions",
    sourceUrl: "https://opentelemetry.io/docs/specs/semconv/general/attributes/",
    sectionHint: "Infrastructure",
    why: "Complements server.address (already tracked) for full endpoint identification. Relevant when organisations use non-standard API gateway ports.",
  },
  // OpenInference (Arize Phoenix) conventions — widely used alternative to OTel GenAI
  {
    name: "openinference.span.kind",
    what: "Span classification in the OpenInference convention: LLM / CHAIN / RETRIEVER / TOOL / EMBEDDING / RERANKER / AGENT / GUARDRAIL / EVALUATOR",
    tier: "C",
    source: "Arize OpenInference Spec",
    sourceUrl: "https://arize-ai.github.io/openinference/spec/semantic_conventions.html",
    sectionHint: "LLM / inference (OpenInference)",
    why: "Alternative to traceloop.span.kind used by Phoenix, DSPy, LlamaIndex, and Haystack instrumentation. If your AI stack uses any of these frameworks you will see this attribute instead of the OTel or Traceloop equivalents.",
  },
  {
    name: "llm.token_count.prompt",
    what: "Prompt token count in legacy OpenInference convention",
    tier: "D",
    source: "OpenInference (legacy)",
    sourceUrl: "https://arize-ai.github.io/openinference/spec/semantic_conventions.html",
    sectionHint: "LLM / inference (OpenInference)",
    why: "Pre-dates the OTel spec. Still emitted by older OpenInference SDK versions. Replaced by gen_ai.usage.input_tokens. Worth knowing about if your spans show unexpected token data in this field.",
  },
  {
    name: "llm.token_count.completion",
    what: "Completion token count in legacy OpenInference convention",
    tier: "D",
    source: "OpenInference (legacy)",
    sourceUrl: "https://arize-ai.github.io/openinference/spec/semantic_conventions.html",
    sectionHint: "LLM / inference (OpenInference)",
    why: "Same as llm.token_count.prompt — legacy OpenInference field replaced by gen_ai.usage.output_tokens.",
  },
  {
    name: "langchain.run_type",
    what: "LangChain execution type: llm / chain / tool / retriever / embedding / prompt / parser",
    tier: "C",
    source: "LangChain Native OTel Integration",
    sourceUrl: "https://python.langchain.com/docs/integrations/providers/opentelemetry/",
    sectionHint: "Agentic orchestration",
    why: "LangChain's native OpenTelemetry integration emits this attribute to classify its internal chain steps. Functionally similar to traceloop.span.kind but specific to LangChain. If your teams use LangChain without OpenLLMetry you will see this instead.",
  },
  {
    name: "gen_ai.client.operation.duration",
    what: "Histogram metric measuring end-to-end client-side AI operation duration in seconds",
    tier: "B",
    source: "OTel GenAI Metrics Spec",
    sourceUrl: "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/",
    sectionHint: "LLM / inference (Metrics)",
    why: "METRIC instrument (not a span attribute). The primary latency SLO metric for AI operations from the client perspective. Pairs with gen_ai.server.request.duration for end-to-end latency budgeting. Ensure your SDK emits this metric alongside span data.",
  },
  {
    name: "gen_ai.workflow.duration",
    what: "Histogram metric measuring end-to-end agentic workflow duration in seconds",
    tier: "B",
    source: "OTel GenAI Metrics Spec",
    sourceUrl: "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/",
    sectionHint: "Agent / Workflow (Metrics)",
    why: "METRIC instrument for tracking total workflow latency from invoke_workflow to completion. Critical for agentic SLOs where multiple model calls, tool executions, and memory operations contribute to the total response time.",
  },
];

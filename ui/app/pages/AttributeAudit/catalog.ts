/**
 * AAA (AI Attribute Audit) — coverage catalog.
 *
 * Mirrors the 10 category sections of the United Airlines "AI Observability
 * Attribute Coverage" notebook, which in turn mirrors the appendix of the
 * AI Observability 3.0 Telemetry document. Each section lists every attribute
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
 */

export interface AttrSpec {
  /** DQL boolean predicate, tested with countIf(...). */
  expr: string;
  /** Display name (the attribute path, or a friendly group label). */
  name: string;
  /** One-line explanation of what the attribute buys you. */
  what: string;
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
      { expr: nn("gen_ai.provider.name"), name: "gen_ai.provider.name", what: "LLM provider" },
      { expr: nn("gen_ai.system"), name: "gen_ai.system", what: "Older provider name (LangChain)" },
      { expr: nn("gen_ai.operation.name"), name: "gen_ai.operation.name", what: "Call type: chat / text_completion / embedding" },
      { expr: nn("gen_ai.request.model"), name: "gen_ai.request.model", what: "Model requested by caller" },
      { expr: nn("gen_ai.response.model"), name: "gen_ai.response.model", what: "Model the provider actually used" },
      { expr: nn("gen_ai.usage.input_tokens"), name: "gen_ai.usage.input_tokens", what: "Input / prompt token count" },
      { expr: nn("gen_ai.usage.output_tokens"), name: "gen_ai.usage.output_tokens", what: "Output / completion token count" },
      { expr: nn("gen_ai.request.temperature"), name: "gen_ai.request.temperature", what: "Sampling temperature" },
      { expr: nn("gen_ai.request.max_tokens"), name: "gen_ai.request.max_tokens", what: "Max tokens requested" },
      { expr: nn("gen_ai.response.finish_reasons"), name: "gen_ai.response.finish_reasons", what: "Why the model stopped" },
      { expr: nn("gen_ai.request.top_p"), name: "gen_ai.request.top_p", what: "Top-p nucleus sampling" },
      { expr: nn("gen_ai.request.stop_sequences"), name: "gen_ai.request.stop_sequences", what: "Stop sequence tokens" },
      { expr: nn("gen_ai.request.frequency_penalty"), name: "gen_ai.request.frequency_penalty", what: "Frequency penalty" },
      { expr: nn("gen_ai.request.presence_penalty"), name: "gen_ai.request.presence_penalty", what: "Presence penalty" },
      { expr: nn("gen_ai.request.is_stream"), name: "gen_ai.request.is_stream", what: "Whether the response was streamed" },
      { expr: nn("gen_ai.request.seed"), name: "gen_ai.request.seed", what: "Reproducibility seed" },
      { expr: nn("gen_ai.request.response_format"), name: "gen_ai.request.response_format", what: "Requested response format" },
      { expr: nn("gen_ai.request.context_utilization"), name: "gen_ai.request.context_utilization", what: "Context window utilization" },
      { expr: nn("gen_ai.request.retry_count"), name: "gen_ai.request.retry_count", what: "Retry count" },
      { expr: nn("gen_ai.response.id"), name: "gen_ai.response.id", what: "Provider-assigned response id" },
      { expr: nn("gen_ai.response.tool_calls"), name: "gen_ai.response.tool_calls", what: "Tool calls made in the response" },
      { expr: either("gen_ai.response.ttft", "gen_ai.response.time_to_first_chunk"), name: "gen_ai.response.ttft", what: "Time-to-first-token (streaming latency)" },
      { expr: nn("gen_ai.response.chunk_count"), name: "gen_ai.response.chunk_count", what: "Streamed chunk count" },
      { expr: nn("gen_ai.response.logprobs"), name: "gen_ai.response.logprobs", what: "Token log-probabilities" },
      { expr: nn("gen_ai.response.warning"), name: "gen_ai.response.warning", what: "SDK warning flag" },
      { expr: nn("gen_ai.usage.total_tokens"), name: "gen_ai.usage.total_tokens", what: "Sum of input + output" },
      { expr: either("gen_ai.usage.cached_tokens", "gen_ai.usage.cache_read.input_tokens"), name: "gen_ai.usage.cached_tokens", what: "Tokens served from prompt cache" },
      { expr: nn("gen_ai.usage.cache_creation_input_tokens"), name: "gen_ai.usage.cache_creation_input_tokens", what: "Tokens written to prompt cache" },
      { expr: nn("gen_ai.client.token.usage"), name: "gen_ai.client.token.usage", what: "New OTel GenAI token metric" },
      { expr: nn("gen_ai.usage.cost"), name: "gen_ai.usage.cost", what: "SDK-reported USD cost" },
      { expr: nn("gen_ai.error.code"), name: "gen_ai.error.code", what: "Provider error code" },
      { expr: nn("gen_ai.error.message"), name: "gen_ai.error.message", what: "Provider error message" },
      { expr: nn("gen_ai.prompt.0.content"), name: "gen_ai.prompt.0.content", what: "Actual prompt text (OpenLLMetry indexed form)" },
      { expr: nn("gen_ai.input.messages"), name: "gen_ai.input.messages", what: "Input messages array (newer convention)" },
      { expr: nn("gen_ai.completion.0.content"), name: "gen_ai.completion.0.content", what: "Actual response text (OpenLLMetry indexed form)" },
      { expr: nn("gen_ai.output.messages"), name: "gen_ai.output.messages", what: "Output messages array (newer convention)" },
      { expr: nn("gen_ai.system_instructions"), name: "gen_ai.system_instructions", what: "System prompt / system message" },
      { expr: nn("gen_ai.cached_response"), name: "gen_ai.cached_response", what: "Whether the response was cache-served" },
      { expr: nn("gen_ai.user"), name: "gen_ai.user", what: "User identifier" },
      { expr: either("gen_ai.feedback.rating", "gen_ai.feedback.label"), name: "gen_ai.feedback.rating / label", what: "Captured user feedback" },
      { expr: nn("gen_ai.privacy.pii_detected"), name: "gen_ai.privacy.pii_detected", what: "Whether PII was found in prompt/response" },
      { expr: nn("gen_ai.privacy.pii_categories"), name: "gen_ai.privacy.pii_categories", what: "Which PII categories were detected" },
      { expr: either("gen_ai.request.guardrail_id", "gen_ai.response.guardrail_action"), name: "gen_ai.request.guardrail_id / response.guardrail_action", what: "Bedrock guardrail id / outcome" },
    ],
  },
  {
    id: "agent",
    number: 2,
    title: "Agent (gen_ai.agent.*)",
    short: "Agent",
    blurb:
      "Identifies the autonomous agent behind a span and how it loops. Required to attribute behaviour, cost, and reliability to a specific agent and to detect runaway iteration.",
    iconKey: "agent",
    population: either("gen_ai.agent.name", "gen_ai.request.model"),
    links: [{ label: "OTel GenAI agent attributes", url: OTEL_GENAI }],
    attributes: [
      { expr: nn("gen_ai.agent.name"), name: "gen_ai.agent.name", what: "Agent identifier / name" },
      { expr: nn("gen_ai.agent.description"), name: "gen_ai.agent.description", what: "Human-readable agent purpose" },
      { expr: nn("gen_ai.agent.type"), name: "gen_ai.agent.type", what: "Architecture type (react, plan-and-execute)" },
      { expr: nn("gen_ai.agent.iteration"), name: "gen_ai.agent.iteration", what: "Current agent-loop iteration" },
      { expr: nn("gen_ai.agent.max_iterations"), name: "gen_ai.agent.max_iterations", what: "Configured loop ceiling" },
    ],
  },
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
      { expr: nn("gen_ai.tool.name"), name: "gen_ai.tool.name", what: "Name of the tool being called" },
      { expr: nn("gen_ai.tool.call.id"), name: "gen_ai.tool.call.id", what: "Unique id for a tool-call invocation" },
      { expr: nn("gen_ai.tool.description"), name: "gen_ai.tool.description", what: "Tool description passed to the model" },
    ],
  },
  {
    id: "traceloop",
    number: 4,
    title: "Traceloop / OpenLLMetry workflow",
    short: "Traceloop workflow",
    blurb:
      "OpenLLMetry's workflow/task/tool span hierarchy. These attributes give the end-to-end trace shape — enclosing workflow, entity inputs/outputs, and span kind — that ties individual LLM calls into a coherent agent run.",
    iconKey: "workflow",
    population: either("traceloop.span.kind", "traceloop.workflow.name", "traceloop.entity.name"),
    links: [{ label: "OpenLLMetry semantic conventions", url: TRACELOOP }],
    attributes: [
      { expr: nn("traceloop.workflow.name"), name: "traceloop.workflow.name", what: "Enclosing workflow (e.g. *.mcp)" },
      { expr: nn("traceloop.entity.name"), name: "traceloop.entity.name", what: "Current task / tool entity" },
      { expr: nn("traceloop.entity.input"), name: "traceloop.entity.input", what: "Serialized input to the tool / task" },
      { expr: nn("traceloop.entity.output"), name: "traceloop.entity.output", what: "Serialized output from the tool / task" },
      { expr: nn("traceloop.entity.path"), name: "traceloop.entity.path", what: "Dot-notation path of nested entities" },
      { expr: nn("traceloop.span.kind"), name: "traceloop.span.kind", what: "Span category: server / tool / workflow / agent / llm" },
      { expr: either("traceloop.association.properties.langgraph_node", "traceloop.association.properties.thread_id"), name: "traceloop.association.properties.* (sampled keys)", what: "Correlation bag — checked via representative keys" },
      { expr: nn("traceloop.prompt_managed_prompts.name"), name: "traceloop.prompt_managed_prompts.name", what: "Identifier for a Traceloop-registry prompt" },
    ],
  },
  {
    id: "langgraph",
    number: 5,
    title: "LangGraph (traceloop.association.properties.langgraph_*)",
    short: "LangGraph",
    blurb:
      "Graph-execution detail emitted by LangGraph through Traceloop association properties. These let you reconstruct which node ran, in what order, on which thread — essential for debugging stateful, multi-node agent graphs.",
    iconKey: "langgraph",
    population: either(
      "traceloop.association.properties.langgraph_node",
      "traceloop.association.properties.langgraph_step",
      "traceloop.association.properties.thread_id",
    ),
    links: [{ label: "OpenLLMetry semantic conventions", url: TRACELOOP }],
    attributes: [
      { expr: nn("traceloop.association.properties.langgraph_node"), name: "langgraph_node", what: "The node that emitted the span" },
      { expr: nn("traceloop.association.properties.langgraph_checkpoint_ns"), name: "langgraph_checkpoint_ns", what: "Checkpoint namespace (graph execution instance)" },
      { expr: nn("traceloop.association.properties.langgraph_step"), name: "langgraph_step", what: "Execution step number within the graph" },
      { expr: nn("traceloop.association.properties.langgraph_triggers"), name: "langgraph_triggers", what: "Which edges/conditions triggered this node" },
      { expr: nn("traceloop.association.properties.langgraph_path"), name: "langgraph_path", what: "Full path through the graph to this node" },
      { expr: nn("traceloop.association.properties.thread_id"), name: "thread_id", what: "Conversation thread across graph runs" },
      { expr: nn("traceloop.association.properties.langgraph_task_idx"), name: "langgraph_task_idx", what: "Task index for parallel node execution" },
      { expr: nn("traceloop.association.properties.langgraph_run_id"), name: "langgraph_run_id", what: "Graph run identifier" },
    ],
  },
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
      { expr: nn("mcp.response.value"), name: "mcp.response.value", what: "Full MCP tool result JSON" },
      { expr: nn("mcp.method.name"), name: "mcp.method.name", what: "RPC method: initialize / tools/call / tools/list" },
      { expr: nn("mcp.session.id"), name: "mcp.session.id", what: "Unique MCP session identifier" },
      { expr: nn("mcp.is_error"), name: "mcp.is_error", what: "Explicit boolean error flag on MCP spans" },
      { expr: nn("mcp.server.name"), name: "mcp.server.name", what: "Canonical MCP server identifier" },
      { expr: nn("mcp.client.name"), name: "mcp.client.name", what: "Calling MCP client identifier" },
    ],
  },
  {
    id: "evaluation",
    number: 7,
    title: "Evaluation & quality",
    short: "Evaluation & quality",
    blurb:
      "Per-response quality scores and prompt-version identifiers. These turn AI observability from 'is it up?' into 'is it good?' — tracking hallucination, faithfulness, and relevance against prompt versions.",
    iconKey: "evaluation",
    population: either("gen_ai.request.model", "gen_ai.evaluation.score"),
    links: [
      { label: "OpenLLMetry semantic conventions", url: TRACELOOP },
      { label: "OTel GenAI attributes", url: OTEL_GENAI },
    ],
    attributes: [
      { expr: nn("gen_ai.evaluation.hallucination"), name: "gen_ai.evaluation.hallucination", what: "Hallucination score (0-1)" },
      { expr: nn("gen_ai.evaluation.correctness"), name: "gen_ai.evaluation.correctness", what: "Factual correctness score" },
      { expr: nn("gen_ai.evaluation.faithfulness"), name: "gen_ai.evaluation.faithfulness", what: "RAG faithfulness (grounded in retrieved docs)" },
      { expr: nn("gen_ai.evaluation.relevance"), name: "gen_ai.evaluation.relevance", what: "Response relevance score" },
      { expr: either("gen_ai.evaluation.score", "gen_ai.evaluation.overall_score"), name: "gen_ai.evaluation.score / overall_score", what: "Composite / weighted eval score" },
      { expr: either("gen_ai.prompt_hub.name", "gen_ai.prompt_hub.version"), name: "gen_ai.prompt_hub.name / version", what: "Prompt version identifier" },
    ],
  },
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
      { expr: nn("session.id"), name: "session.id", what: "Application session identifier" },
      { expr: nn("gen_ai.conversation.id"), name: "gen_ai.conversation.id", what: "Multi-turn conversation thread id" },
      { expr: nn("gen_ai.user"), name: "gen_ai.user", what: "User identifier" },
      { expr: nn("dt.rum.session.id"), name: "dt.rum.session.id", what: "Dynatrace RUM session id (front-to-back link)" },
    ],
  },
  {
    id: "vectordb",
    number: 9,
    title: "Vector database",
    short: "Vector database",
    blurb:
      "Retrieval-augmented generation telemetry: the vector store, the query, the returned chunks, and embedding dimensionality. These explain why a model answered the way it did and where RAG quality breaks down.",
    iconKey: "vectordb",
    population: either("db.system", "vector_db.query.text", "gen_ai.request.embedding_dimensions"),
    links: [
      { label: "OTel database attributes", url: OTEL_DB },
      { label: "OpenLLMetry semantic conventions", url: TRACELOOP },
    ],
    attributes: [
      { expr: nn("db.system"), name: "db.system", what: "Database system type (redis, milvus, postgres)" },
      { expr: nn("vector_db.query.text"), name: "vector_db.query.text", what: "Text query sent to the vector store" },
      { expr: nn("vector_db.results"), name: "vector_db.results", what: "Retrieved documents / chunks" },
      { expr: nn("vector_db.query.top_k"), name: "vector_db.query.top_k", what: "Number of results requested" },
      { expr: either("gen_ai.request.embedding_dimensions", "gen_ai.embeddings.dimension.count"), name: "gen_ai.request.embedding_dimensions", what: "Embedding vector dimensionality" },
    ],
  },
  {
    id: "infra",
    number: 10,
    title: "Infrastructure / platform context",
    short: "Infrastructure",
    blurb:
      "Where the workload runs and the platform-level signals that surface failures. These connect AI spans to services, Kubernetes placement, hosts, and the HTTP/RPC/exception attributes Davis uses for problem detection.",
    iconKey: "infra",
    population: either("gen_ai.request.model", "traceloop.span.kind", "mcp.response.value"),
    links: [
      { label: "OTel service attributes", url: OTEL_SERVICE },
      { label: "OTel Kubernetes attributes", url: OTEL_K8S },
    ],
    attributes: [
      { expr: nn("service.name"), name: "service.name", what: "Service / application name" },
      { expr: nn("dt.service.name"), name: "dt.service.name", what: "Dynatrace-resolved service name" },
      { expr: either("k8s.namespace.name", "k8s.cluster.name", "k8s.workload.name"), name: "k8s.namespace.name / cluster.name / workload.name", what: "Kubernetes placement" },
      { expr: nn("host.name"), name: "host.name", what: "Hostname" },
      { expr: nn("exception.type"), name: "exception.type", what: "Exception class name" },
      { expr: nn("http.response.status_code"), name: "http.response.status_code", what: "HTTP status (error detection at >=400)" },
      { expr: nn("rpc.method"), name: "rpc.method", what: "RPC method (invokemodel, converse)" },
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

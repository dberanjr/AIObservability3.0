/**
 * Attribute capability registry + coalescing field readers.
 *
 * The AI Attribute Audit page catalogs the *ideal* attribute set a workload
 * could emit. Most of those attributes are not yet consumed by any feature —
 * they are catalogued, not wired. This module is the bridge: it declares the
 * subset of attributes that an actual feature depends on (a "capability") and
 * the DQL helpers needed to read them.
 *
 * Two pieces:
 *   1. CAPABILITIES — one entry per feature-gating attribute group. The
 *      CapabilityContext probe runs `countIf(predicate)` for each, and a panel
 *      renders only when its capability has coverage > 0 in the tenant. This is
 *      how a feature "lights up" automatically once instrumentation appears,
 *      with no code change.
 *   2. firstNonNull / anyPresent — DQL expression builders that coalesce the
 *      several spellings the same logical attribute is emitted under (newer OTel
 *      vs. older OpenLLMetry), so either form populates a feature.
 *
 * Every attribute path referenced here also appears in the Audit catalog
 * (catalog.ts) — the catalog stays the canonical inventory; this file is the
 * canonical list of what is *wired*. Keep the two in sync when adding a
 * capability: if you gate a feature on an attribute, make sure the Audit
 * catalogs it too.
 */

/** Back-tick a dotted attribute path so DQL treats it as one field. */
export const bt = (path: string): string => `\`${path}\``;

/** DQL boolean: the attribute (any of its spellings) is present on the span. */
export const anyPresent = (...paths: string[]): string =>
  paths.map((p) => `isNotNull(${bt(p)})`).join(" or ");

/**
 * DQL value expression: the first non-null spelling of a logical attribute.
 * Use when reading a value that may arrive under more than one convention.
 */
export const firstNonNull = (...paths: string[]): string =>
  paths.length === 1
    ? bt(paths[0])
    : `coalesce(${paths.map(bt).join(", ")})`;

/** DQL boolean: ALL listed attributes are present on the span. */
export const allPresent = (...paths: string[]): string =>
  paths.map((p) => `isNotNull(${bt(p)})`).join(" and ");

/**
 * Dedicated vector-store `db.system` values. RAG detection keys on these
 * VALUES (a vector store surfaces as a db.system value, e.g. "pinecone") — NOT
 * on db.system merely being present, which also matches every ordinary
 * relational DB (Oracle/MySQL/…) and would light RAG up on plain database
 * traffic. Validation confirmed this: ualpre's db.system is 100% relational
 * (zero vector stores), while demolive emits real `pinecone` spans. Limited to
 * purpose-built vector stores; ambiguous engines (redis/mongodb/elasticsearch/
 * opensearch) that *can* store vectors but usually don't are excluded to avoid
 * false positives.
 */
export const VECTOR_DB_SYSTEMS = [
  "pinecone",
  "qdrant",
  "chroma",
  "chromadb",
  "weaviate",
  "milvus",
  "pgvector",
  "vespa",
  "lancedb",
  "marqo",
  "deeplake",
  "faiss",
  "vectara",
  "turbopuffer",
] as const;

/** DQL boolean: `db.system` is one of the dedicated vector stores. */
export const dbSystemIsVectorStore = (): string =>
  `in(${bt("db.system")}, ${VECTOR_DB_SYSTEMS.map((v) => `"${v}"`).join(", ")})`;

/** Stable identifiers for each wired capability. */
export type CapabilityId =
  | "cacheTokens"
  | "cacheWriteTokens"
  | "sdkCost"
  | "guardrails"
  | "piiCategories"
  | "vectorDb"
  | "feedback"
  | "promptVersion"
  | "ttft"
  | "evalScore"
  | "sessionUser"
  | "mcp"
  | "injectionEnrichment"
  | "memoryStore";

export interface Capability {
  id: CapabilityId;
  /** Short human label for "new data detected" surfaces. */
  label: string;
  /** Audit catalog section id this capability draws from. */
  sectionId: string;
  /** DQL boolean predicate, tested with countIf() by the capability probe. */
  predicate: string;
}

/**
 * The wired capability set. Each predicate ORs together every spelling the
 * Audit catalog accepts for the underlying attribute(s).
 */
export const CAPABILITIES: Capability[] = [
  {
    id: "cacheTokens",
    label: "Prompt cache reads",
    sectionId: "llm",
    predicate: anyPresent(
      "gen_ai.usage.cached_tokens",
      "gen_ai.usage.cache_read.input_tokens",
    ),
  },
  {
    id: "cacheWriteTokens",
    label: "Prompt cache writes",
    sectionId: "llm",
    predicate: anyPresent("gen_ai.usage.cache_creation_input_tokens"),
  },
  {
    id: "sdkCost",
    label: "SDK-reported cost",
    sectionId: "llm",
    predicate: anyPresent("gen_ai.usage.cost"),
  },
  {
    id: "guardrails",
    label: "Guardrails",
    sectionId: "llm",
    predicate: anyPresent(
      "gen_ai.request.guardrail_id",
      "gen_ai.response.guardrail_action",
    ),
  },
  {
    id: "piiCategories",
    label: "PII categories",
    sectionId: "llm",
    predicate: anyPresent("gen_ai.privacy.pii_categories"),
  },
  {
    id: "vectorDb",
    label: "Vector database / RAG",
    sectionId: "vectordb",
    // Vector store as a db.system VALUE (not db.system-any) OR explicit
    // vector_db.* attributes. See VECTOR_DB_SYSTEMS for why.
    predicate: `${dbSystemIsVectorStore()} or ${anyPresent(
      "vector_db.query.text",
      "vector_db.results",
      "vector_db.query.top_k",
    )}`,
  },
  {
    id: "feedback",
    label: "User feedback",
    sectionId: "llm",
    predicate: anyPresent("gen_ai.feedback.rating", "gen_ai.feedback.label"),
  },
  {
    id: "promptVersion",
    label: "Prompt versioning",
    sectionId: "evaluation",
    predicate: anyPresent("gen_ai.prompt_hub.name", "gen_ai.prompt_hub.version"),
  },
  {
    id: "ttft",
    label: "Time to first token (TTFT)",
    sectionId: "llm",
    predicate: anyPresent(
      "gen_ai.usage.time_to_first_token",
      "gen_ai.response.ttft",
      "gen_ai.response.time_to_first_chunk",
    ),
  },
  {
    id: "evalScore",
    label: "Quality / hallucination scores",
    sectionId: "evaluation",
    predicate: anyPresent(
      "gen_ai.evaluation.score",
      "gen_ai.evaluation.overall_score",
      "gen_ai.evaluation.correctness",
      "gen_ai.evaluation.faithfulness",
      "gen_ai.evaluation.hallucination",
      "gen_ai.evaluation.relevance",
    ),
  },
  {
    id: "sessionUser",
    label: "Session / user cost attribution",
    sectionId: "llm",
    // Both are needed for per-session AND per-user attribution (F.3).
    predicate: allPresent("session.id", "gen_ai.user"),
  },
  {
    id: "mcp",
    label: "MCP servers / tools",
    sectionId: "tools",
    predicate: `span.name == "mcp.server" or ${anyPresent(
      "mcp.method.name",
      "mcp.server.name",
    )}`,
  },
  {
    id: "injectionEnrichment",
    label: "Prompt-injection / PII enrichment",
    sectionId: "client",
    // Populated by an upstream OpenPipeline security/PII enrichment rule — the
    // app consumes the field when present, it does not build the enrichment.
    predicate: anyPresent(
      "gen_ai.privacy.pii_detected",
      "gen_ai.security.prompt_injection",
      "gen_ai.security.injection_score",
      "security.threat.detected",
    ),
  },
  {
    id: "memoryStore",
    label: "Memory / state store",
    sectionId: "memory",
    predicate: anyPresent(
      "gen_ai.conversation.id",
      "traceloop.association.properties.thread_id",
      "traceloop.association.properties.langgraph_checkpoint_ns",
    ),
  },
];

export const CAPABILITY_IDS: CapabilityId[] = CAPABILITIES.map((c) => c.id);

/**
 * "AI activity" population for the capability probe. Wide enough that
 * vector-store-only or agent-only spans still count toward the denominator, but
 * deliberately NOT `db.system`-any: on a large tenant ordinary relational DB
 * spans (100M+ on ualpre) would dominate the scanned population and, under the
 * honoured scan-limit selector, truncate the probe before rare GenAI attributes
 * are seen — causing false-negative capability detection. Scoping to dedicated
 * vector stores keeps the population AI-relevant and the probe reliable.
 */
export const AI_SPAN_POPULATION = `${anyPresent(
  "gen_ai.request.model",
  "gen_ai.operation.name",
  "gen_ai.agent.name",
  "traceloop.span.kind",
)} or ${dbSystemIsVectorStore()}`;

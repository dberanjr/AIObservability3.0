/**
 * Canonical attribute accessors and provider normalization.
 *
 * Different teams instrument AI workloads with different conventions:
 *   - OTel GenAI semantic conventions (gen_ai.*)
 *   - LangSmith / Langfuse SDKs (langsmith.*, langfuse.*)
 *   - Anthropic via AWS Bedrock (model.id looks like "anthropic.claude-...")
 *
 * This module is the *only* place that should know about those differences.
 * Hooks and queries elsewhere read through these helpers so swapping a
 * convention later requires changes only here.
 */

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "aws-bedrock"
  | "azure"
  | "cohere"
  | "mistral"
  | "unknown";

export interface NormalizedProvider {
  id: ProviderId;
  label: string;
  /** True when the model is served via AWS Bedrock proxy. */
  viaBedrock: boolean;
}

const BEDROCK_VENDOR_PREFIX = /^(anthropic|amazon|cohere|meta|mistral|ai21)\./i;

export const PROVIDER_DISPLAY: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "aws-bedrock": "AWS Bedrock",
  azure: "Azure",
  cohere: "Cohere",
  mistral: "Mistral",
  unknown: "Unknown",
};

/**
 * Map a raw gen_ai.provider.name / model identifier into a normalized provider.
 * Handles the Bedrock-proxy case: anthropic models served via bedrock should
 * be attributed back to anthropic, with a `viaBedrock` flag preserved.
 */
export const normalizeProvider = (
  rawSystem?: string | null,
  rawModel?: string | null,
): NormalizedProvider => {
  const system = (rawSystem ?? "").trim().toLowerCase();
  const model = (rawModel ?? "").trim().toLowerCase();
  const looksBedrock =
    system === "bedrock" ||
    system === "aws-bedrock" ||
    system === "aws_bedrock" ||
    /bedrock/.test(system);

  // Bedrock model IDs carry the upstream vendor as a prefix.
  if (looksBedrock && BEDROCK_VENDOR_PREFIX.test(model)) {
    const vendor = model.split(".", 1)[0].toLowerCase();
    if (vendor === "anthropic")
      return { id: "anthropic", label: "Anthropic", viaBedrock: true };
    if (vendor === "cohere")
      return { id: "cohere", label: "Cohere", viaBedrock: true };
    if (vendor === "mistral")
      return { id: "mistral", label: "Mistral", viaBedrock: true };
    if (vendor === "amazon")
      return { id: "aws-bedrock", label: "AWS Bedrock", viaBedrock: true };
    if (vendor === "meta")
      return {
        id: "aws-bedrock",
        label: "Meta (via Bedrock)",
        viaBedrock: true,
      };
    return { id: "aws-bedrock", label: "AWS Bedrock", viaBedrock: true };
  }

  if (looksBedrock)
    return { id: "aws-bedrock", label: "AWS Bedrock", viaBedrock: true };
  if (system === "anthropic" || /claude/.test(model))
    return { id: "anthropic", label: "Anthropic", viaBedrock: false };
  if (
    system === "openai" ||
    system === "azure-openai" ||
    system === "azure_openai" ||
    /^gpt-/.test(model) ||
    /text-embedding-/.test(model)
  ) {
    if (system === "azure-openai" || system === "azure_openai")
      return { id: "azure", label: "Azure OpenAI", viaBedrock: false };
    return { id: "openai", label: "OpenAI", viaBedrock: false };
  }
  if (
    system === "google" ||
    system === "vertex-ai" ||
    system === "vertex_ai" ||
    /^gemini/.test(model)
  )
    return { id: "google", label: "Google", viaBedrock: false };
  if (system === "azure")
    return { id: "azure", label: "Azure", viaBedrock: false };
  if (system === "cohere") return { id: "cohere", label: "Cohere", viaBedrock: false };
  if (system === "mistral")
    return { id: "mistral", label: "Mistral", viaBedrock: false };

  return { id: "unknown", label: "Unknown", viaBedrock: false };
};

export const ALL_PROVIDER_IDS: ProviderId[] = [
  "anthropic",
  "openai",
  "aws-bedrock",
  "google",
  "azure",
  "cohere",
  "mistral",
];

export const PROVIDER_COLOR: Record<ProviderId, string> = {
  anthropic: "var(--purple-2)",
  openai: "var(--green-2)",
  google: "var(--green-2)",
  "aws-bedrock": "var(--cyan)",
  azure: "var(--blue)",
  cohere: "var(--blue-purple)",
  mistral: "var(--amber)",
  unknown: "var(--text-4)",
};

/** Truncate the date suffix from a model name (e.g. "...-20250114" -> ""). */
export const stripModelVersion = (model: string | null | undefined): string =>
  typeof model === "string" ? model.replace(/-\d{8}(?:-v\d+)?$/i, "") : "";

export interface CanonicalModel {
  /** Stable grouping key — variants of the same model share it. */
  key: string;
  /** Human-friendly display label, e.g. "Claude Sonnet 4.6". */
  label: string;
}

const TITLE = (s: string): string =>
  s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/**
 * Collapse the many ways the same model is logged into one canonical
 * key + label. The BOS tenant emits the SAME model under several
 * conventions, e.g.:
 *   global.anthropic.claude-sonnet-4-6           ┐
 *   Claude-Sonnet-4.6                            ├ → "Claude Sonnet 4.6"
 *   us.anthropic.claude-sonnet-4-5-20250929-v1:0 → "Claude Sonnet 4.5"
 *
 * Strategy: strip region (global./us./eu.) + vendor (anthropic./amazon./…)
 * prefixes, drop date stamps and bedrock revision tags (-v1:0, :0), then
 * special-case the Claude family (tier + X.Y version, order-independent)
 * since that's where the dash-vs-dot and word-order variants live. Other
 * families fall back to a conservative cleanup that still merges prefix and
 * date variants without over-collapsing distinct versions.
 */
export const canonicalizeModel = (raw?: string | null): CanonicalModel => {
  const original = (raw ?? "").trim();
  if (!original) return { key: "unknown", label: "Unknown" };

  let s = original.toLowerCase();
  // Region prefix (global. us. eu. apac. …) then vendor prefix.
  s = s.replace(/^(global|us|eu|apac|apj|sa|usgov)\./, "");
  s = s.replace(
    /^(anthropic|amazon|cohere|meta|mistral|ai21|openai|google)\./,
    "",
  );
  // Date stamps and bedrock revision tags.
  s = s.replace(/[-_]?\d{8}/g, "");
  s = s.replace(/[-_]v\d+(?::\d+)?$/i, "");
  s = s.replace(/:\d+$/, "");
  // Unify separators so "4.6" and "4-6" compare equal.
  s = s.replace(/[._]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Claude family: order-independent tier + version extraction.
  if (s.includes("claude")) {
    const tier = ["opus", "sonnet", "haiku"].find((t) => s.includes(t)) ?? "";
    // Strip the family/tier words, then read the first numeric version group
    // ("4-6" → 4.6, "4" → 4) — order-independent so "claude-4.5-opus" and
    // "claude-opus-4-5" both resolve to 4.5.
    const rest = s.replace("claude", "").replace(tier, "");
    const vm = rest.match(/(\d+)(?:-(\d+))?/);
    const ver = vm ? (vm[2] ? `${vm[1]}.${vm[2]}` : vm[1]) : "";
    const labelParts = ["Claude", TITLE(tier), ver].filter(Boolean);
    const keyParts = ["claude", tier, ver].filter(Boolean);
    return { key: keyParts.join("-"), label: labelParts.join(" ") };
  }

  // Generic fallback: prettify the cleaned string but don't over-merge.
  // Restore X.Y version dots ("4-1" → "4.1") for display only.
  const label = TITLE(s.replace(/(\d)-(\d)/g, "$1.$2").replace(/-/g, " "))
    .replace(/\bGpt\b/, "GPT")
    .trim();
  return { key: s, label };
};

/** Approximate framework detection from a span attribute or process tag. */
export type Framework =
  | "AgentExecutor"
  | "LangGraph"
  | "RunnableSequence"
  | "retrieval_chain"
  | "Custom"
  | "Unknown";

const FRAMEWORK_PATTERNS: Array<[RegExp, Framework]> = [
  [/langgraph/i, "LangGraph"],
  [/agent[\s_-]?executor/i, "AgentExecutor"],
  [/runnable[\s_-]?sequence/i, "RunnableSequence"],
  [/retrieval[\s_-]?chain/i, "retrieval_chain"],
];

export const detectFramework = (
  spanName?: string | null,
  pipelineTag?: string | null,
): Framework => {
  for (const candidate of [spanName, pipelineTag]) {
    if (!candidate) continue;
    for (const [re, label] of FRAMEWORK_PATTERNS) {
      if (re.test(candidate)) return label;
    }
  }
  if (spanName || pipelineTag) return "Custom";
  return "Unknown";
};

/**
 * Canonical orchestration-framework identity, detected from the OTel/Traceloop
 * signals each instrumentation emits. Unlike `detectFramework` (a span-name
 * heuristic kept for Explorer), this resolves against the AUTHORITATIVE
 * attributes confirmed by reading each instrumentation's source and validated
 * against ualpre. See the design spec's "Research" table.
 */
export type FrameworkId =
  | "langgraph"
  | "langchain"
  | "crewai"
  | "llamaindex"
  | "haystack"
  | "openai-agents"
  | "google-adk"
  | "agno"
  | "pydantic-ai"
  | "custom"
  | "unknown";

export const FRAMEWORK_LABEL: Record<FrameworkId, string> = {
  langgraph: "LangGraph",
  langchain: "LangChain",
  crewai: "CrewAI",
  llamaindex: "LlamaIndex",
  haystack: "Haystack",
  "openai-agents": "OpenAI Agents SDK",
  "google-adk": "Google ADK",
  agno: "Agno",
  "pydantic-ai": "Pydantic AI",
  custom: "Custom",
  unknown: "Unknown",
};

/** Raw span signals used to resolve framework identity. */
export interface FrameworkSignal {
  /** traceloop.workflow.name */
  workflowName?: string | null;
  /** traceloop.entity.name */
  entityName?: string | null;
  /** gen_ai.system — provider for most instrumentations, framework for crewai/agno. */
  genAiSystem?: string | null;
  /** span.name */
  spanName?: string | null;
  /** gen_ai.workflow.name (Google ADK) */
  genAiWorkflowName?: string | null;
  /** OTel instrumentation scope name */
  scope?: string | null;
}

/**
 * gen_ai.system values that denote a FRAMEWORK (not an LLM provider). Only these
 * are honored; any other gen_ai.system value (openai, anthropic, …) is a provider
 * and must NOT resolve to a framework.
 */
const GENAI_SYSTEM_FRAMEWORKS: Record<string, FrameworkId> = {
  crewai: "crewai",
  agno: "agno",
  langchain: "langchain",
};

/** Patterns over traceloop.workflow.name / traceloop.entity.name. */
const TL_NAME_PATTERNS: Array<[RegExp, FrameworkId]> = [
  [/langgraph/i, "langgraph"],
  [/^(runnable|agentexecutor|retrieval[\s_-]?chain)/i, "langchain"],
  [/agent\s*workflow/i, "openai-agents"],
  [/llama[\s_-]?index/i, "llamaindex"],
  [/haystack/i, "haystack"],
  [/crew/i, "crewai"],
];

export const detectFrameworkFromSignals = (sig: FrameworkSignal): FrameworkId => {
  // 1. Traceloop workflow/entity names — the primary signal on real tenants.
  for (const name of [sig.workflowName, sig.entityName]) {
    if (!name) continue;
    for (const [re, id] of TL_NAME_PATTERNS) if (re.test(name)) return id;
  }
  // 2. gen_ai.system — only when the value is a known framework (value-mapped).
  const sys = (sig.genAiSystem ?? "").trim().toLowerCase();
  if (sys && GENAI_SYSTEM_FRAMEWORKS[sys]) return GENAI_SYSTEM_FRAMEWORKS[sys];
  // 3. Google ADK — invoke_agent/execute_tool span names with a gen_ai.workflow.name.
  if (sig.spanName && /^(invoke_agent|execute_tool)\b/i.test(sig.spanName) && sig.genAiWorkflowName)
    return "google-adk";
  // 4. Pydantic AI — instrumentation scope marker (best-effort; no ualpre data).
  if (sig.scope && /pydantic[_-]?ai/i.test(sig.scope)) return "pydantic-ai";
  // 5. Some agent signal present but unmatched → custom; nothing at all → unknown.
  //    A bare gen_ai.system value is a provider (openai, anthropic, …), not an
  //    agent signal — framework values already returned in step 2 — so it must
  //    NOT trigger the "custom" fallback.
  if (sig.workflowName || sig.entityName || sig.spanName) return "custom";
  return "unknown";
};

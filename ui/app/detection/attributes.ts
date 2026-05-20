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

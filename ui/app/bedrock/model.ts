import { normalizeModelKey } from "../data/pricing";

/** Bedrock modelId → rate-card key. normalizeModelKey already strips ARNs,
 *  region prefixes (us./global.), vendor prefixes, versions and dates. */
export const normalizeBedrockModelId = (modelId: string): string =>
  normalizeModelKey(modelId);

const VENDOR_LABEL: Record<string, string> = {
  anthropic: "Anthropic", amazon: "Amazon", meta: "Meta",
  cohere: "Cohere", mistral: "Mistral", ai21: "AI21", deepseek: "DeepSeek",
};

/** Provider display name from the modelId (after stripping ARN path + region). */
export const bedrockProviderOf = (modelId: string): string => {
  const s = modelId.toLowerCase().replace(/^.*\//, "").replace(/^(us|eu|apac|ap|sa|global)\./, "");
  const vendor = s.split(".")[0];
  return VENDOR_LABEL[vendor] ?? "Other";
};

/** Human-ish short name for tables/legends (keeps the version, drops prefixes). */
export const shortModelName = (modelId: string): string =>
  modelId.replace(/^.*\//, "").replace(/^(us|eu|apac|ap|sa|global)\./, "").replace(/^[a-z0-9]+\./, "");

/**
 * DQL-side helpers that mirror the client-side `normalizeProvider` logic.
 * Push provider normalization down so aggregations bucket Bedrock-proxied
 * Anthropic / Cohere / Mistral models under their upstream vendor instead
 * of producing a separate "bedrock" slice.
 */

/**
 * Returns a DQL expression that emits the normalized provider id given
 * `gen_ai.provider.name` + `gen_ai.request.model`. Drop into a `fieldsAdd` clause
 * and group by the resulting field instead of `gen_ai.provider.name`.
 *
 * Output values match the `ProviderId` union: anthropic / openai / google /
 * aws-bedrock / azure / cohere / mistral / unknown.
 */
export const dqlNormalizedProvider = (
  systemField = "gen_ai.provider.name",
  modelField = "gen_ai.request.model",
): string => `if(
  matchesValue(${systemField}, "*bedrock*") and matchesValue(${modelField}, "anthropic.*"), "anthropic",
  else: if(matchesValue(${systemField}, "*bedrock*") and matchesValue(${modelField}, "cohere.*"), "cohere",
  else: if(matchesValue(${systemField}, "*bedrock*") and matchesValue(${modelField}, "mistral.*"), "mistral",
  else: if(matchesValue(${systemField}, "*bedrock*"), "aws-bedrock",
  else: if(matchesValue(${systemField}, "vertex*"), "google",
  else: if(matchesValue(${systemField}, "azure?openai") or matchesValue(${systemField}, "azure_openai"), "azure",
  else: if(isNotNull(${systemField}), lower(${systemField}),
  else: "unknown"))))))
)`;

/**
 * A DQL boolean that's true when the row was served via Bedrock proxy.
 * Use as `fieldsAdd via_bedrock = ${dqlViaBedrock()}` then surface the flag
 * in the UI footnote.
 */
export const dqlViaBedrock = (
  systemField = "gen_ai.provider.name",
): string => `matchesValue(${systemField}, "*bedrock*")`;

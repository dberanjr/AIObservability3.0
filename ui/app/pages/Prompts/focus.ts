import { LOGICAL_ERROR_EXPR } from "../../scope/queries";

/**
 * Pulse problem-pattern drill-downs land on the Prompts tab with `?focus=<id>`
 * (set by the Pulse NodeDrawer, see PP-2). Each id maps to a DQL boolean
 * fragment applied as `| filter (<predicate>)` in `buildPromptsListQuery`, and
 * an optional `orderBy` DQL expression that sharpens the pattern by surfacing
 * the worst offenders first (e.g. highest ttft / most tokens). The `label`
 * drives the removable "Filtered: <label>" chip on the page.
 *
 * These are page-local predicates (comparisons / thresholds), NOT global
 * attribute filters — they're kept here rather than routed through
 * injectGlobalFilters. The focus ANDs with the sidebar (`pf_*`) filter and the
 * global filter.
 *
 * The destination reads the RAW `?focus` string param (NOT the typed
 * useFocusParam union, which only covers architecture-layer keys).
 */
export interface FocusPreset {
  /** Human label shown in the "Filtered: <label>" chip. */
  label: string;
  /** DQL boolean fragment applied as `| filter (<predicate>)`. */
  predicate: string;
  /**
   * Optional DQL sort expression (without the leading `| sort`) applied so the
   * worst-offending rows surface first, e.g. `gen_ai.response.ttft desc`.
   */
  orderBy?: string;
}

/**
 * Model fallback / mismatch: request model != response model, AFTER normalizing
 * both sides so provider routing prefixes + version/date snapshots of the SAME
 * logical model don't false-positive. On this tenant EVERY raw request!=response
 * pair was such a non-difference (e.g. request `us.anthropic.claude-opus-4-8`,
 * response `claude-opus-4-8` — same model, Bedrock region prefix only), so
 * normalization is essential, not cosmetic.
 *
 * Normalization uses DQL `replacePattern` with DPL patterns (NOT regex —
 * `replacePattern` takes a DPL pattern; a regex with `(...)` alternation throws
 * ERROR_IN_PARSING_PATTERN). Four passes, in order, validated on ualpre:
 *   1. `<region>.<vendor>.` prefix → ``  (us.anthropic. / global.anthropic.)
 *   2. `-YYYY-MM-DD` date snapshot → ``  (gpt-4o-2024-08-06 → gpt-4o)
 *   3. `-vN` / `-vN:N` version tag → ``  (…-v1:0, …-v1)
 *   4. `-NNNNNNNN` (8-digit) date  → ``  (…-20241022)
 * Genuine variants (gpt-4o vs gpt-4o-mini, sonnet vs haiku) are preserved, so
 * the comparison flags only real base-model differences (true fallbacks).
 * Caveat: a non-numeric rolling alias (e.g. `-latest`, `-preview`) is NOT
 * stripped and would read as a mismatch vs the bare base name; not observed
 * on this tenant.
 */
const MODEL_NORM = (col: string): string =>
  `replacePattern(replacePattern(replacePattern(replacePattern(lower(toString(${col})), "LD:p '.' LD:v '.'", ""), "'-' INT:y '-' INT:mo '-' INT:d", ""), "'-v' INT:vn (':' INT:sub)? EOS", ""), "'-' INT:d8 EOS", "")`;

const MODEL_MISMATCH_PREDICATE = `isNotNull(gen_ai.response.model) and isNotNull(gen_ai.request.model) and ${MODEL_NORM(
  "gen_ai.request.model",
)} != ${MODEL_NORM("gen_ai.response.model")}`;

export const FOCUS_PREDICATES: Record<string, FocusPreset> = {
  "llm-ctx-exhaustion": {
    label: "Context-window exhaustion",
    // Responses cut off by the length / max-tokens limit. Reuses the same
    // finish_reasons → toString → contains approach the Prompts page already
    // uses for its `truncated` flag, widened to also catch the "length" reason.
    predicate: `contains(toString(gen_ai.response.finish_reasons), "max_tokens") or contains(toString(gen_ai.response.finish_reasons), "length")`,
  },
  "llm-logical-errors": {
    label: "Logical errors",
    // The shared logical-error rule (error status / http>=400 / exception /
    // gen_ai.error.code / refusal / content_filter).
    predicate: LOGICAL_ERROR_EXPR,
  },
  "llm-rate-limit": {
    label: "Provider rate-limit",
    predicate: `toLong(coalesce(http.response.status_code, 0)) == 429`,
  },
  "llm-model-mismatch": {
    label: "Model fallback / mismatch",
    predicate: MODEL_MISMATCH_PREDICATE,
  },
  "llm-ttft-degradation": {
    label: "TTFT degradation",
    // Capability-gated: surfaces only prompts that emit ttft (none if the
    // tenant doesn't instrument it), worst-first.
    predicate: `isNotNull(gen_ai.response.ttft)`,
    orderBy: `gen_ai.response.ttft desc`,
  },
  "orch-token-growth": {
    label: "Token growth",
    // Within-trace token growth isn't derivable from a single span, so this is
    // an approximation: surface the largest-token prompts (biggest consumers).
    // `in_tok` / `out_tok` are fieldsAdd'd by buildPromptsListQuery before the
    // sort, so this orders on the same coalesced token totals.
    predicate: `toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)) + toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)) > 0`,
    orderBy: `in_tok + out_tok desc`,
  },
};

/** Type guard: is this raw `?focus` value a known Prompts-tier focus preset? */
export const isPromptsFocus = (
  focus: string | null | undefined,
): focus is string => Boolean(focus && focus in FOCUS_PREDICATES);

/** Resolve a raw `?focus` value to its preset (or undefined if unknown). */
export const promptsFocusPreset = (
  focus: string | null | undefined,
): FocusPreset | undefined =>
  isPromptsFocus(focus) ? FOCUS_PREDICATES[focus] : undefined;

// Pure helpers for the trace span-attribute panel: humanizing raw attribute
// keys, inferring a display type, and grouping every attribute by namespace
// (gen_ai.*, llm.*, traceloop.*, …) plus curated Core/Error/Identifiers/Other
// sections. Kept free of React so they can be unit-tested directly.

export type AttrType = "string" | "number" | "bool" | "time" | "duration" | "id";

export interface Attr {
  label: string;
  value: string | number | boolean | null;
  type: AttrType;
  /** Raw attribute key (e.g. `gen_ai.prompt.0.role`), when the row came from a
   *  span attribute. Included in the panel's search haystack so users can filter
   *  by the dotted key, not just the humanized label. */
  key?: string;
}

export interface AttrSectionData {
  title: string;
  rows: Attr[];
}

/**
 * AI / OpenLLMetry attribute namespaces surfaced as their own groups, in
 * display order. Each raw key starting with `prefix` lands in that group; the
 * title matches the humanized-namespace style in the design (e.g. "Gen ai").
 * `dt.smartscape.gen_ai.` is Dynatrace-derived GenAI topology, called out
 * separately so it isn't swept into the generic `gen_ai.`/infra buckets.
 */
export const AI_ATTR_GROUPS: { prefix: string; title: string }[] = [
  { prefix: "gen_ai.", title: "Gen ai" },
  { prefix: "llm.", title: "Llm" },
  { prefix: "traceloop.", title: "Traceloop" },
  { prefix: "openinference.", title: "Openinference" },
  { prefix: "mcp.", title: "Mcp" },
  { prefix: "dt.smartscape.gen_ai.", title: "Gen ai (Dynatrace)" },
];

/**
 * Humanize a raw attribute key into a label: dots and underscores become
 * spaces, then only the first character is capitalized (sentence case), so
 * `gen_ai.prompt.0.role` → "Gen ai prompt 0 role".
 */
export const humanizeAttrKey = (key: string): string => {
  const spaced = key.replace(/[._]+/g, " ").trim();
  if (spaced.length === 0) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Infer a display type from a raw attribute value (JS runtime type). */
export const inferAttrType = (value: unknown): AttrType => {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return "number";
  return "string";
};

/** Normalize a raw attribute value to a primitive the row renderer can show.
 *  Arrays render as `[a, b]`, objects as JSON; null/empty are dropped upstream. */
const normalizeValue = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return `[${value.map((v) => String(v)).join(", ")}]`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
};

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === "";

/**
 * Build the AI/OpenLLMetry namespace groups from a raw attribute map. Returns
 * one section per AI_ATTR_GROUPS prefix that has at least one non-empty
 * attribute, rows sorted by key. Longer prefixes are matched first so
 * `dt.smartscape.gen_ai.*` is not captured by a shorter group.
 */
export const buildAiAttrSections = (
  attributes: Record<string, unknown>,
): AttrSectionData[] => {
  const keys = Object.keys(attributes).sort();
  const claimed = new Set<string>();
  // Match longest prefix first so nested namespaces win over their parents.
  const byLongest = [...AI_ATTR_GROUPS].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  const rowsByPrefix = new Map<string, Attr[]>();
  for (const key of keys) {
    if (isEmpty(attributes[key])) continue;
    const group = byLongest.find((g) => key.startsWith(g.prefix));
    if (!group) continue;
    claimed.add(key);
    const rows = rowsByPrefix.get(group.prefix) ?? [];
    rows.push({
      key,
      label: humanizeAttrKey(key),
      value: normalizeValue(attributes[key]),
      type: inferAttrType(attributes[key]),
    });
    rowsByPrefix.set(group.prefix, rows);
  }
  // Preserve the declared display order (AI_ATTR_GROUPS), not longest-first.
  return AI_ATTR_GROUPS.filter((g) => rowsByPrefix.has(g.prefix)).map((g) => ({
    title: g.title,
    rows: rowsByPrefix.get(g.prefix)!,
  }));
};

/**
 * Keys the AI groups matched — callers pass this to `buildOtherAttrSection` so
 * the same attribute isn't shown twice. Exposed for that composition.
 */
export const aiClaimedKeys = (
  attributes: Record<string, unknown>,
): Set<string> => {
  const claimed = new Set<string>();
  for (const key of Object.keys(attributes)) {
    if (isEmpty(attributes[key])) continue;
    if (AI_ATTR_GROUPS.some((g) => key.startsWith(g.prefix))) claimed.add(key);
  }
  return claimed;
};

/**
 * Build the catch-all "Other attributes" section: every non-empty attribute
 * that is neither an AI-namespace key nor already shown in a curated section
 * (`excludeKeys`). Rows sorted by key. Returns null when there's nothing left.
 */
export const buildOtherAttrSection = (
  attributes: Record<string, unknown>,
  excludeKeys: Set<string>,
): AttrSectionData | null => {
  const aiKeys = aiClaimedKeys(attributes);
  const rows: Attr[] = Object.keys(attributes)
    .sort()
    .filter(
      (k) => !isEmpty(attributes[k]) && !aiKeys.has(k) && !excludeKeys.has(k),
    )
    .map((k) => ({
      key: k,
      label: humanizeAttrKey(k),
      value: normalizeValue(attributes[k]),
      type: inferAttrType(attributes[k]),
    }));
  return rows.length > 0 ? { title: "Other attributes", rows } : null;
};

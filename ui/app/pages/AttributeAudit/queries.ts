/**
 * AAA (AI Attribute Audit) — per-section DQL builders.
 *
 * One query per catalog section. Each emits a single record:
 *   { section_spans, a0, a1, ... aN }
 * where section_spans is the section's span population (the denominator) and
 * a{i} is the count of spans carrying attribute i (see catalog.attributes).
 * The page maps a{i} back to its AttrSpec client-side — far cheaper than the
 * notebook's array/expand/fieldsFlatten table reshaping, which only existed
 * to render a notebook table.
 *
 * Every query starts with `fetch spans, samplingRatio: 1, …, scanLimitGBytes: 500`
 * so useScopedDql can rewrite the sampling ratio and scan limit to the
 * toolbar's selections and inject the global attribute filter + segments. The
 * timeframe is interpolated from the active scope. As a result every number on
 * this page honours the selected timeframe, scan limit, sampling, segments,
 * and global filters — exactly like the rest of the app.
 */

import { dqlTimeArg } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";
import type { AuditSection } from "./catalog";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Build the coverage query for one section. The summarize block names the
 * attribute counters a0..aN in catalog order so the hook can zip them back to
 * `section.attributes`.
 */
export const buildSectionQuery = (
  section: AuditSection,
  timeframe: Timeframe,
): string => {
  const counters = section.attributes
    .map((attr, i) => `    a${i} = countIf(${attr.expr})`)
    .join(",\n");

  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
| filter ${section.population}
| summarize {
    section_spans = count(),
${counters}
  }
`.trim();
};

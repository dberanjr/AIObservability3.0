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

import { dqlEscape, dqlTimeArg } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";
import type { AuditSection } from "./catalog";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Build the coverage query for one section. The summarize block names the
 * attribute counters a0..aN in catalog order so the hook can zip them back to
 * `section.attributes`.
 *
 * When `bucket` is set (the user picked a detected AI bucket), a
 * `| filter dt.system.bucket == "<bucket>"` pipe is inserted right after the
 * fetch so the whole page's coverage is scoped to that one bucket. This is
 * page-local scoping, independent of the app-wide bucket-filter tweak.
 */
export const buildSectionQuery = (
  section: AuditSection,
  timeframe: Timeframe,
  bucket?: string,
): string => {
  const counters = section.attributes
    .map((attr, i) => `    a${i} = countIf(${attr.expr})`)
    .join(",\n");

  const bucketFilter = bucket
    ? `\n| filter dt.system.bucket == "${dqlEscape(bucket)}"`
    : "";

  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500${bucketFilter}
| filter ${section.population}
| summarize {
    section_spans = count(),
${counters}
  }
`.trim();
};

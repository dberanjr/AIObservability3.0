/**
 * AWS Bedrock raw-telemetry audit — per-section DQL builders. Mirrors
 * `../queries.ts` (one query per section, N attribute counters packed into a
 * single `summarize`/`timeseries`), but over logs/events/metrics instead of
 * spans — see `./catalog.ts` for why these can't share one query shape with
 * the OTel span audit.
 */

import { dqlTimeArg } from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";
import type { AwsTelemetrySection } from "./catalog";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/** Section A/D (logs/events): population + per-field presence counters in one
 *  `summarize`. `samplingRatio`/`scanLimitGBytes` are placeholder literals
 *  useScopedDql rewrites to the toolbar's live selections (see `../queries.ts`'s
 *  doc comment for the same convention). */
export const buildPopulationSectionQuery = (
  section: AwsTelemetrySection,
  timeframe: Timeframe,
): string => {
  const source = section.kind === "logs" ? "logs" : "events";
  const counters = section.fields
    .map((f, i) => `    a${i} = countIf(isNotNull(${f.path}))`)
    .join(",\n");
  const parts = [
    `fetch ${source}, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500`,
  ];
  if (section.prefilter) parts.push(`| filter ${section.prefilter}`);
  if (section.parse) parts.push(`| parse ${section.parse}`);
  if (section.postfilter) parts.push(`| filter ${section.postfilter}`);
  parts.push(`| summarize {\n    section_rows = count(),\n${counters}\n  }`);
  return parts.join("\n");
};

/** Section B/C (metrics): binary "did any datapoint land" check — one
 *  `count(\`metric\`, scalar: true)` per field, no population/parse step. */
export const buildMetricSectionQuery = (
  section: AwsTelemetrySection,
  timeframe: Timeframe,
): string => {
  const counters = section.fields
    .map((f, i) => `    a${i} = count(\`${f.path}\`, scalar: true)`)
    .join(",\n");
  return `timeseries {\n${counters}\n  }, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}`;
};

/** Dispatches to the right builder for the section's kind. */
export const buildAwsTelemetrySectionQuery = (
  section: AwsTelemetrySection,
  timeframe: Timeframe,
): string =>
  section.kind === "metrics"
    ? buildMetricSectionQuery(section, timeframe)
    : buildPopulationSectionQuery(section, timeframe);

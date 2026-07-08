import { dqlTimeArg } from "../../scope/queries";
import { GENAI_BUCKET_MATCHER } from "../../detection/genaiBucketMatcher";
import type { Timeframe } from "../../scope/types";

/**
 * Census query: for each Grail bucket, how many AI spans (per the genai_spans
 * storage rule) it holds over the timeframe. Because it filters by the matcher
 * BEFORE summarizing by bucket, only buckets with >= 1 AI span appear — the
 * results list never shows empty buckets.
 *
 * Runs through useScopedDql with `ignoreBucketFilter` + `ignoreSegments` (and
 * `ignoreGlobalFilter`, matching the fleet-wide nature of the Attributes page)
 * so it surveys the whole tenant regardless of the current bucket tweak /
 * segment / attribute filter, while still honouring the toolbar timeframe,
 * scan-limit, and sampling.
 */
export const buildBucketDetectionQuery = (tf: Timeframe): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(tf.from)}, to: ${dqlTimeArg(
    tf.to ?? "now()",
  )}, scanLimitGBytes: 500
| filter ${GENAI_BUCKET_MATCHER}
| summarize spans = count(), by: {dt.system.bucket}
| sort spans desc
`.trim();

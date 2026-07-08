import type { BedrockScope } from "./types";
import type { Timeframe } from "../scope/types";

const arr = (xs: string[]): string => xs.map((x) => `"${x}"`).join(",");
const tf = (s: BedrockScope): string => `from: ${s.timeframe.from}, to: ${s.timeframe.to ?? "now()"}`;

/** Base pipeline: bedrock log group (indexed prefilter) → ModelInvocationLog →
 *  parse JSON → optional account/model scope. `b` holds the parsed record. */
export const bedrockLogBase = (s: BedrockScope): string => {
  const parts = [
    `fetch logs, ${tf(s)}`,
    `| filter contains(dt.da.aws.log_group, "bedrock")`,
    `| filter contains(content, "ModelInvocationLog")`,
    `| parse content, "JSON:b"`,
  ];
  if (s.accounts.length) parts.push(`| filter in(b[accountId], array(${arr(s.accounts)}))`);
  if (s.models.length)
    parts.push(`| filter in(b[modelId], array(${arr(s.models)}))`);
  return parts.join("\n");
};

/** Common fieldsAdd that flattens the tokens/model/identity for downstream use. */
const FLATTEN = `| fieldsAdd modelId = b[modelId],
    inTok = toLong(b[input][inputTokenCount]),
    outTok = toLong(b[output][outputTokenCount]),
    cacheRead = toLong(b[input][cacheReadInputTokenCount]),
    cacheWrite = toLong(b[input][cacheWriteInputTokenCount]),
    account = b[accountId],
    session = arrayLast(splitString(b[identity][arn], "/")),
    hasError = if(isNotNull(b[errorCode]), 1, else: 0)`;

export const buildBedrockOverviewQuery = (s: BedrockScope): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| summarize {
    invocations = count(),
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite),
    accounts = countDistinct(account),
    models = countDistinct(modelId),
    sessions = countDistinct(session),
    errors = sum(hasError)
  }`;

export const buildBedrockDailyCostQuery = (s: BedrockScope): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| makeTimeseries {
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite)
  }, interval: 1d, by: { modelId }`;

/** One row per (session, account, modelId) — NOT per session — so a
 *  multi-model agent session (e.g. Opus for planning + Nova for tool calls)
 *  can be priced model-by-model in `parseAgentSessions` instead of the whole
 *  session's tokens getting priced at a single model's rate. `sort` +
 *  `limit` still cap by row volume; a heavy multi-model session now spends
 *  more than one row of that budget, which is the right trade-off for
 *  correct per-model pricing. */
export const buildAgentSessionsQuery = (s: BedrockScope): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| summarize {
    invocations = count(),
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite),
    errors = sum(hasError)
  }, by: { session, account, modelId }
  | sort invocations desc | limit 200`;

export const buildAccountModelQuery = (s: BedrockScope): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| summarize {
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite)
  }, by: { account, modelId }`;

/**
 * Distinct accounts + models seen in ANY Bedrock invocation log over the
 * timeframe — the option source for the D6 scope selectors. Deliberately
 * does NOT go through `bedrockLogBase(scope)` (which applies the CURRENT
 * account/model filter): if it did, picking one model would prune every
 * other model out of its own picker's option list. Values are raw log
 * fields (`accountId`, `modelId`) — the same shape `bedrockLogBase` filters
 * against (`in(b[accountId], …)` / `in(b[modelId], …)`), so a selected
 * option round-trips straight back into `BedrockScope.accounts/models`.
 */
export const buildBedrockFacetsQuery = (tf: Timeframe): string =>
  [
    `fetch logs, from: ${tf.from}, to: ${tf.to ?? "now()"}`,
    `| filter contains(dt.da.aws.log_group, "bedrock")`,
    `| filter contains(content, "ModelInvocationLog")`,
    `| parse content, "JSON:b"`,
    `| summarize accounts = collectDistinct(b[accountId]), models = collectDistinct(b[modelId])`,
  ].join("\n");

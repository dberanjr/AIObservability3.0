import type { BedrockScope } from "./types";
import type { Timeframe } from "../scope/types";
import { parseScopeMs } from "../scope/chartInterval";

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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Adaptive bucket width (seconds) for the daily-cost chart, keyed off the
 * scope's `from` expression via {@link parseScopeMs}. A fixed `interval: 1d`
 * collapsed every sub-day scope into a single bucket (the chart went blank
 * for a 1h or 6h window) while still being too coarse to show intraday
 * shape for a several-hour incident window. This ladder snaps to a bucket
 * that keeps the chart legible from a 1-hour scope up through a 90-day one.
 * Always expressed in SECONDS — DQL's `m` duration unit is ambiguous
 * between minutes and months, so this (like the rest of the app) never
 * emits a bare `1m`.
 */
export const bedrockCostIntervalSec = (from: string): number => {
  const ms = parseScopeMs(from);
  if (ms <= 2 * HOUR_MS) return 60; // 1m
  if (ms <= 6 * HOUR_MS) return 300; // 5m
  if (ms <= 12 * HOUR_MS) return 900; // 15m
  if (ms < DAY_MS) return 1800; // 30m
  if (ms < 14 * DAY_MS) return 3600; // 1h — up to 14 days
  return 86400; // 1d — 14 days or more
};

export const buildBedrockDailyCostQuery = (s: BedrockScope): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| makeTimeseries {
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite)
  }, interval: ${bedrockCostIntervalSec(s.timeframe.from)}s, by: { modelId }`;

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

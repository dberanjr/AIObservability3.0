import type { BedrockScope } from "./types";
import type { Timeframe } from "../scope/types";
import { parseScopeMs, pickChartIntervalSec } from "../scope/chartInterval";

const arr = (xs: string[]): string => xs.map((x) => `"${x}"`).join(",");
const tf = (s: BedrockScope): string => `from: ${s.timeframe.from}, to: ${s.timeframe.to ?? "now()"}`;

/** Cheap existence probe: any bedrock log group row in the ACTIVE timeframe
 *  (not a hardcoded rolling window — a fixed lookback disagrees with every
 *  other query on the page whenever the user picks a different range,
 *  producing a false "no telemetry" result over a window that's actually
 *  populated). See `useBedrockAvailable`. */
export const buildBedrockAvailableQuery = (timeframe: Timeframe): string =>
  `fetch logs, from: ${timeframe.from}, to: ${timeframe.to ?? "now()"}\n| filter contains(dt.da.aws.log_group, "bedrock")\n| limit 1\n| fields timestamp`;

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
 * scope's `from` expression via {@link parseScopeMs}. Tuned to keep the column
 * count roughly ≤ 30–48 across every window so the bars never overflow the
 * container (each column has a 4px min width) and the x-axis labels stay
 * readable: multi-day windows fold to DAILY buckets (a 7-day scope → 7 columns
 * labelled M/D, a 30-day scope → 30), while sub-day windows keep intraday shape.
 * A prior ladder used 1h buckets for anything under 14 days, which turned a
 * 7-day scope into 168 unreadable, overflowing hourly columns.
 *
 * Always expressed in SECONDS — DQL's `m` duration unit is ambiguous between
 * minutes and months, so this (like the rest of the app) never emits a bare `1m`.
 */
export const bedrockCostIntervalSec = (from: string): number => {
  const ms = parseScopeMs(from);
  if (ms <= 2 * HOUR_MS) return 300; // 5m — ≤24 cols up to 2h
  if (ms <= 12 * HOUR_MS) return 1800; // 30m — ≤24 cols up to 12h
  if (ms < 2 * DAY_MS) return 3600; // 1h — 24 cols at 1d, ≤48 up to 2d
  if (ms < 4 * DAY_MS) return 6 * 3600; // 6h — ≤16 cols for 2–4 day windows
  return 86400; // 1d — 7d → 7 cols, 30d → 30, 90d → 90 (labels thinned)
};

export const buildBedrockDailyCostQuery = (
  s: BedrockScope,
  intervalSec: number = bedrockCostIntervalSec(s.timeframe.from),
): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| makeTimeseries {
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite)
  }, interval: ${intervalSec}s, by: { modelId }`;

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

/** Bucketed invocations/errors for the Error rate KPI tile's sparkline — same
 *  {@link pickChartIntervalSec} ladder as every other KPI-row/hero sparkline
 *  on this page, so they all read at identical granularity. */
export const buildBedrockErrorRateSparkQuery = (
  s: BedrockScope,
  intervalSec: number = pickChartIntervalSec(s.timeframe.from),
): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| makeTimeseries {
    invocations = count(),
    errors = sum(hasError)
  }, interval: ${intervalSec}s`;

/** Bucketed distinct-session-count for the Sessions KPI tile's sparkline.
 *  `countDistinct` inside `makeTimeseries` is HyperLogLog-approximate — fine
 *  for a trend line; the exact headline Sessions count still comes from
 *  `useBedrockOverview`'s `summarize`-based `countDistinct`. */
export const buildAgentSessionsSparkQuery = (
  s: BedrockScope,
  intervalSec: number = pickChartIntervalSec(s.timeframe.from),
): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| makeTimeseries sessions = countDistinct(session), interval: ${intervalSec}s`;

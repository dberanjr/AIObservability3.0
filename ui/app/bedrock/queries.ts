import type { BedrockScope } from "./types";

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

export const buildAgentSessionsQuery = (s: BedrockScope): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| summarize {
    invocations = count(),
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite),
    errors = sum(hasError),
    models = collectDistinct(modelId)
  }, by: { session, account }
  | sort invocations desc | limit 200`;

export const buildAccountModelQuery = (s: BedrockScope): string =>
  `${bedrockLogBase(s)}\n${FLATTEN}\n| summarize {
    inTok = sum(inTok), outTok = sum(outTok),
    cacheRead = sum(cacheRead), cacheWrite = sum(cacheWrite)
  }, by: { account, modelId }`;

import type { GovScope } from "./types";
import { pickChartIntervalSec } from "../../scope/chartInterval";

/**
 * Access & Governance query builders — 100% CloudTrail (`fetch events`,
 * eventSource `bedrock.amazonaws.com`). Every builder shares {@link govBase},
 * which parses the CloudTrail `data` payload as `JSON:ct` and flattens the
 * governance-relevant fields. Validated against fifththird-preprod (due93336)
 * over 7 days — see the spec's "Validated data facts".
 *
 * These are events queries (not spans/logs), so the consuming hooks pass the
 * `ignore*` flags in useGovernance.ts to bypass the span-only injectors, and
 * `samplingRatioOverride: 1` for exact security counts (a no-op here since the
 * sampling injector only rewrites `fetch spans|logs`).
 */

const quote = (xs: string[]): string => xs.map((x) => `"${x}"`).join(", ");

// The four Bedrock data-plane invoke event names — extracted to a const so the
// long CloudTrail identifier doesn't trip the no-secrets entropy lint inside a
// template literal. Not a secret; a public AWS API action name list.
// eslint-disable-next-line noSecrets/no-secrets
const INVOKE_EVENTS = '"InvokeModel", "InvokeModelWithResponseStream", "Converse", "ConverseStream"';
const tf = (s: GovScope): string =>
  `from: ${s.timeframe.from}, to: ${s.timeframe.to ?? "now()"}`;

/** Base pipeline: bedrock CloudTrail events → parsed `ct` → flattened fields →
 *  optional account scope. `identity_name` is the last ARN path segment (role
 *  session / user name), matching the source dashboard. */
export const govBase = (s: GovScope): string => {
  const parts = [
    `fetch events, ${tf(s)}`,
    `| filter cloud.provider == "aws"`,
    `| parse data, "JSON:ct"`,
    `| filter ct[eventSource] == "bedrock.amazonaws.com"`,
    `| fieldsAdd
    eventName       = ct[eventName],
    arn             = ct[userIdentity][arn],
    accountId       = ct[recipientAccountId],
    region          = ct[awsRegion],
    sourceIp        = ct[sourceIPAddress],
    errorCode       = ct[errorCode],
    mfa             = ct[userIdentity][sessionContext][attributes][mfaAuthenticated],
    inferenceRegion = ct[serviceEventDetails][AdditionalEventData][additionalEntries][inferenceRegion],
    readOnly        = ct[readOnly]`,
    `| fieldsAdd identity_name = arrayLast(splitString(arn, "/"))`,
  ];
  if (s.accounts.length) {
    parts.push(`| filter in(accountId, array(${quote(s.accounts)}))`);
  }
  return parts.join("\n");
};

const interval = (s: GovScope): number => pickChartIntervalSec(s.timeframe.from);

/** Six headline counters in one summarize (matches the KPI band). */
export const buildGovKpisQuery = (s: GovScope): string =>
  `${govBase(s)}
| summarize {
    totalCalls = count(),
    distinctIdentities = countDistinct(identity_name),
    distinctSourceIps = countDistinct(sourceIp),
    distinctAccounts = countDistinct(accountId),
    erroredCalls = countIf(isNotNull(errorCode)),
    nonMfaCalls = countIf(mfa == "false"),
    crossRegionCalls = countIf(isNotNull(inferenceRegion) and inferenceRegion != region)
  }`;

export const buildApiActionsQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(eventName)
| summarize calls = count(), by: { eventName }
| sort calls desc`;

export const buildApiActionsTimeseriesQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(eventName)
| makeTimeseries calls = count(), interval: ${interval(s)}s, by: { eventName }`;

export const buildTopIdentitiesQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(identity_name)
| summarize calls = count(), by: { identity_name }
| sort calls desc
| limit 15`;

export const buildTopSourceIpsQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(sourceIp)
| summarize calls = count(), identities = countDistinct(identity_name), by: { sourceIp }
| sort calls desc
| limit 20`;

export const buildIdentityMfaQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(identity_name)
| summarize calls = count(), source_ips = countDistinct(sourceIp), by: { identity_name, mfa }
| sort calls desc
| limit 25`;

export const buildAccessDeniedQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(errorCode) and contains(errorCode, "AccessDenied")
| summarize deniedCalls = count(), lastSeen = takeMax(timestamp), by: { identity_name, sourceIp, eventName }
| sort deniedCalls desc
| limit 50`;

export const buildThrottleQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(errorCode) and (contains(errorCode, "Throttling") or contains(errorCode, "TooManyRequests"))
| summarize throttledCalls = count(), lastSeen = takeMax(timestamp), by: { identity_name, eventName, sourceIp, region }
| sort throttledCalls desc
| limit 50`;

export const buildErrorsTimeseriesQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(errorCode)
| makeTimeseries errors = count(), interval: ${interval(s)}s, by: { errorCode }`;

export const buildCrossRegionQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(inferenceRegion)
| summarize calls = count(), by: { region, inferenceRegion }
| sort calls desc`;

export const buildControlPlaneQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter readOnly == false
| sort timestamp desc
| fields timestamp, eventName, identity_name, region, sourceIp
| limit 50`;

export const buildAccountRegionQuery = (s: GovScope): string =>
  `${govBase(s)}
| filter isNotNull(accountId)
| summarize calls = count(), identities = countDistinct(identity_name), by: { accountId, region }
| sort calls desc`;

/**
 * Reconciliation: ModelInvocationLog metering count vs CloudTrail invoke-event
 * count. A gap flags a logging blind spot (CloudTrail saw the call, the
 * metering log didn't). Counts only — deliberately NOT additive with cost.
 * The log leg uses the indexed `dt.da.aws.log_group` prefilter (the app's
 * convention) rather than the source dashboard's unindexed `contains(content…)`
 * alone.
 */
export const buildReconciliationQuery = (s: GovScope): string => {
  const acct = s.accounts.length
    ? `\n| filter in(b[accountId], array(${quote(s.accounts)}))`
    : "";
  const acctCt = s.accounts.length
    ? `\n    | filter in(accountId, array(${quote(s.accounts)}))`
    : "";
  return `fetch logs, ${tf(s)}
| filter contains(dt.da.aws.log_group, "bedrock")
| filter contains(content, "ModelInvocationLog")
| parse content, "JSON:b"${acct}
| summarize invocations = count()
| fieldsAdd source = "ModelInvocationLog (metering)"
| append [
    fetch events, ${tf(s)}
    | filter cloud.provider == "aws"
    | parse data, "JSON:ct"
    | filter ct[eventSource] == "bedrock.amazonaws.com"
    | fieldsAdd eventName = ct[eventName], accountId = ct[recipientAccountId]
    | filter in(eventName, ${INVOKE_EVENTS})${acctCt}
    | summarize invocations = count()
    | fieldsAdd source = "CloudTrail (invoke events)"
  ]
| sort source asc`;
};

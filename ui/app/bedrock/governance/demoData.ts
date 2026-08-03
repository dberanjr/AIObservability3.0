/**
 * Canned Demo Mode dataset for the Access & Governance sub-tab (ported from
 * the standalone AWSBedrockApp's `bedrock/governance/demoData.ts`).
 *
 * One cohesive, internally-consistent scenario across 3 AWS accounts, 16
 * identities, and 15 source IPs, designed so every card/table on the tab
 * renders full of plausible detail instead of an empty state. Every hook in
 * `./useGovernance.ts` swaps in the matching constant here (and disables its
 * real Grail query via `enabled: !s.showExample`) once the scope's
 * `showExample` field is true.
 *
 * Numbers are deliberately cross-consistent rather than independently
 * randomized, so the story holds together under scrutiny:
 *  - DEMO_GOV_KPIS's totalCalls (11,405) equals the sum of `DEMO_API_ACTIONS`.
 *  - DEMO_GOV_KPIS's crossRegionCalls (797) equals the sum of `DEMO_CROSS_REGION`
 *    and both `DEMO_EXFIL_TIMESERIES` series combined.
 *  - DEMO_GOV_KPIS's erroredCalls (262) equals the sum of `DEMO_ERRORS_TIMESERIES`
 *    four series combined (AccessDenied + ThrottlingException match the totals
 *    in `DEMO_ACCESS_DENIED` / `DEMO_THROTTLES` exactly).
 *  - DEMO_GOV_KPIS's nonMfaCalls (160) equals the two `mfa: "false"` rows in
 *    `DEMO_IDENTITY_MFA`.
 *  - The one flagged identity in `DEMO_IDENTITY_MFA` (`sourceIps: 3`) and the
 *    shared IPs in `DEMO_TOP_SOURCE_IPS` (`identities: 2`) are the anomalous
 *    access examples; the single `DEMO_CROSS_REGION` row whose region family
 *    differs is the one residency exception, and it's also the only slice
 *    `DEMO_EXFIL_*` covers.
 */

import type {
  GovKpis,
  ApiActionRow,
  IdentityCallRow,
  SourceIpRow,
  IdentityMfaRow,
  AccessDeniedRow,
  ThrottleRow,
  CrossRegionRow,
  ControlPlaneRow,
  ReconciliationRow,
  AccountRegionRow,
  GovTimeseries,
} from "./types";
import {
  classifyUserAgent,
  regionCountry,
  type ExfilDestinationRow,
  type ExfilActorRow,
  type ExfilDetailRow,
} from "./exfiltration";

// --- shared time helpers -----------------------------------------------------

/** ISO timestamp `h` hours before "now" — keeps every lastSeen/timestamp
 *  column looking fresh no matter when the demo data is rendered. */
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

/** Compact "M/D" bucket label `daysAgo` days before "now" (UTC) — matches the
 *  real chart axis format `foldGovTimeseries` produces. */
const dayLabel = (daysAgo: number): string => {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

const BUCKET_COUNT = 10;
/** Ten daily buckets ending "today", oldest first. */
const DEMO_LABELS = Array.from({ length: BUCKET_COUNT }, (_, i) => dayLabel(BUCKET_COUNT - 1 - i));

// One of the four Bedrock data-plane invoke event names — extracted to a
// const so the long CloudTrail identifier doesn't trip the no-secrets entropy
// lint everywhere it's reused below.
// eslint-disable-next-line noSecrets/no-secrets
const INVOKE_STREAM_EVENT = "InvokeModelWithResponseStream";

// --- population ---------------------------------------------------------------

/** 3 AWS accounts CloudTrail has seen Bedrock calls from — feeds the Account
 *  picker and `DEMO_ACCOUNT_REGION`. */
export const DEMO_ACCOUNTS: string[] = ["111122223333", "444455556666", "777788889999"];

// --- KPIs ---------------------------------------------------------------------

export const DEMO_GOV_KPIS: GovKpis = {
  totalCalls: 11_405,
  distinctIdentities: 16,
  distinctSourceIps: 15,
  distinctAccounts: 3,
  erroredCalls: 262,
  nonMfaCalls: 160,
  crossRegionCalls: 797,
};

// --- API actions ----------------------------------------------------------------

export const DEMO_API_ACTIONS: ApiActionRow[] = [
  { eventName: "InvokeModel", calls: 5200 },
  { eventName: "ConverseStream", calls: 3100 },
  { eventName: "Converse", calls: 1800 },
  { eventName: INVOKE_STREAM_EVENT, calls: 900 },
  { eventName: "GetFoundationModel", calls: 250 },
  { eventName: "ListFoundationModels", calls: 90 },
  { eventName: "CreateModelInvocationJob", calls: 40 },
  { eventName: "StartIngestionJob", calls: 12 },
  { eventName: "TagResource", calls: 8 },
  { eventName: "PutModelInvocationLoggingConfiguration", calls: 5 },
];

export const DEMO_API_ACTIONS_TIMESERIES: GovTimeseries = {
  labels: DEMO_LABELS,
  series: [
    { key: "InvokeModel", values: [560, 380, 600, 615, 470, 400, 555, 610, 590, 420] },
    { key: "ConverseStream", values: [330, 220, 350, 365, 280, 235, 325, 360, 340, 295] },
    { key: "Converse", values: [190, 130, 205, 210, 165, 135, 195, 208, 192, 170] },
    { key: INVOKE_STREAM_EVENT, values: [95, 62, 102, 108, 82, 65, 98, 105, 95, 88] },
  ],
};

// --- identities & source IPs ----------------------------------------------------

/** Top 15 identities by call volume (matches `buildTopIdentitiesQuery`'s
 *  `limit 15`) — `SecurityAuditRole/session-audit-14` (25 calls) is the 16th
 *  identity and is cut off here, but still counted in `distinctIdentities`
 *  and present in `DEMO_IDENTITY_MFA` (limit 25). */
export const DEMO_TOP_IDENTITIES: IdentityCallRow[] = [
  { identity: "DataScienceNotebookRole/jupyter-prod-07", calls: 2100 },
  { identity: "MLPlatformServiceRole/svc-inference-01", calls: 1800 },
  { identity: "BedrockAgentRole/session-a1b2c3", calls: 1450 },
  { identity: "ChatOpsBotRole/session-f3d9e1", calls: 1200 },
  { identity: "MLPlatformServiceRole/svc-inference-02", calls: 980 },
  { identity: "SupportCopilotRole/session-8c2a44", calls: 860 },
  { identity: "RAGIngestionRole/svc-ingest-03", calls: 700 },
  { identity: "DataScienceNotebookRole/jupyter-prod-12", calls: 610 },
  { identity: "FraudDetectionRole/session-b77e10", calls: 480 },
  { identity: "BatchSummarizationRole/svc-batch-09", calls: 390 },
  { identity: "QAAutomationRole/session-ci-2291", calls: 310 },
  { identity: "AdminConsoleRole/jdoe", calls: 190 },
  { identity: "ThirdPartyIntegrationRole/session-ext-55", calls: 150 },
  { identity: "MarketingContentRole/session-77aa01", calls: 110 },
  { identity: "AdminConsoleRole/asmith", calls: 50 },
];

/**
 * 15 source IPs. `198.51.100.23` (shared by ChatOpsBotRole + SupportCopilotRole),
 * `10.20.4.15` (BedrockAgentRole + AdminConsoleRole/jdoe) and `10.20.4.22`
 * (BedrockAgentRole + SecurityAuditRole) are each shared by 2 identities — the
 * "IP shared by 2+ identities" anomalous-access signal.
 */
export const DEMO_TOP_SOURCE_IPS: SourceIpRow[] = [
  { sourceIp: "203.0.113.5", calls: 2100, identities: 1 },
  { sourceIp: "198.51.100.23", calls: 2060, identities: 2 },
  { sourceIp: "10.44.8.101", calls: 1800, identities: 1 },
  { sourceIp: "172.31.6.44", calls: 980, identities: 1 },
  { sourceIp: "10.20.4.15", calls: 790, identities: 2 },
  { sourceIp: "192.0.2.77", calls: 700, identities: 1 },
  { sourceIp: "10.90.2.13", calls: 610, identities: 1 },
  { sourceIp: "172.31.6.9", calls: 500, identities: 1 },
  { sourceIp: "203.0.113.44", calls: 480, identities: 1 },
  { sourceIp: "10.44.8.102", calls: 390, identities: 1 },
  { sourceIp: "10.20.4.22", calls: 375, identities: 2 },
  { sourceIp: "192.0.2.91", calls: 310, identities: 1 },
  { sourceIp: "198.51.100.87", calls: 150, identities: 1 },
  { sourceIp: "203.0.113.19", calls: 110, identities: 1 },
  { sourceIp: "10.20.4.31", calls: 50, identities: 1 },
];

/**
 * All 16 identities × their mfa posture (limit 25, so nothing is cut off
 * here). BedrockAgentRole (session a1b2c3) is the identity spanning 3 source
 * IPs — the "identity spanning 3+ IPs" anomalous-access signal. Only the two
 * human/console-driven identities carry an explicit MFA flag ("true"/"false");
 * every service role's `mfaAuthenticated` is unset (`n/a`), same as a real
 * tenant's programmatic access.
 */
export const DEMO_IDENTITY_MFA: IdentityMfaRow[] = [
  { identity: "DataScienceNotebookRole/jupyter-prod-07", mfa: "n/a", calls: 2100, sourceIps: 1 },
  { identity: "MLPlatformServiceRole/svc-inference-01", mfa: "n/a", calls: 1800, sourceIps: 1 },
  { identity: "BedrockAgentRole/session-a1b2c3", mfa: "n/a", calls: 1450, sourceIps: 3 },
  { identity: "ChatOpsBotRole/session-f3d9e1", mfa: "n/a", calls: 1200, sourceIps: 1 },
  { identity: "MLPlatformServiceRole/svc-inference-02", mfa: "n/a", calls: 980, sourceIps: 1 },
  { identity: "SupportCopilotRole/session-8c2a44", mfa: "n/a", calls: 860, sourceIps: 1 },
  { identity: "RAGIngestionRole/svc-ingest-03", mfa: "n/a", calls: 700, sourceIps: 1 },
  { identity: "DataScienceNotebookRole/jupyter-prod-12", mfa: "n/a", calls: 610, sourceIps: 1 },
  { identity: "FraudDetectionRole/session-b77e10", mfa: "n/a", calls: 480, sourceIps: 1 },
  { identity: "BatchSummarizationRole/svc-batch-09", mfa: "n/a", calls: 390, sourceIps: 1 },
  { identity: "QAAutomationRole/session-ci-2291", mfa: "n/a", calls: 310, sourceIps: 1 },
  { identity: "AdminConsoleRole/jdoe", mfa: "true", calls: 190, sourceIps: 1 },
  { identity: "ThirdPartyIntegrationRole/session-ext-55", mfa: "n/a", calls: 150, sourceIps: 1 },
  { identity: "MarketingContentRole/session-77aa01", mfa: "false", calls: 110, sourceIps: 1 },
  { identity: "AdminConsoleRole/asmith", mfa: "false", calls: 50, sourceIps: 1 },
  { identity: "SecurityAuditRole/session-audit-14", mfa: "true", calls: 25, sourceIps: 1 },
];

// --- access denied / throttling ---------------------------------------------

export const DEMO_ACCESS_DENIED: AccessDeniedRow[] = [
  { identity: "FraudDetectionRole/session-b77e10", sourceIp: "203.0.113.44", eventName: "InvokeModel", deniedCalls: 14, lastSeen: hoursAgo(6) },
  { identity: "ThirdPartyIntegrationRole/session-ext-55", sourceIp: "198.51.100.87", eventName: "Converse", deniedCalls: 9, lastSeen: hoursAgo(14) },
  { identity: "QAAutomationRole/session-ci-2291", sourceIp: "192.0.2.91", eventName: INVOKE_STREAM_EVENT, deniedCalls: 5, lastSeen: hoursAgo(50) },
  { identity: "MarketingContentRole/session-77aa01", sourceIp: "203.0.113.19", eventName: "ConverseStream", deniedCalls: 3, lastSeen: hoursAgo(70) },
];

export const DEMO_THROTTLES: ThrottleRow[] = [
  { identity: "MLPlatformServiceRole/svc-inference-01", eventName: "InvokeModel", sourceIp: "10.44.8.101", region: "us-east-1", throttledCalls: 18, lastSeen: hoursAgo(2) },
  { identity: "BatchSummarizationRole/svc-batch-09", eventName: "ConverseStream", sourceIp: "10.44.8.102", region: "us-west-2", throttledCalls: 7, lastSeen: hoursAgo(9) },
];

export const DEMO_ERRORS_TIMESERIES: GovTimeseries = {
  labels: DEMO_LABELS,
  series: [
    { key: "ValidationException", values: [12, 18, 10, 20, 14, 8, 16, 22, 19, 11] },
    { key: "ModelTimeoutException", values: [4, 6, 3, 8, 5, 2, 7, 9, 6, 6] },
    { key: "AccessDenied", values: [2, 4, 5, 3, 2, 1, 4, 3, 5, 2] },
    { key: "ThrottlingException", values: [1, 3, 2, 4, 1, 2, 3, 4, 2, 3] },
  ],
};

// --- cross-region / data residency -------------------------------------------

/** region → inferenceRegion routing pairs. Only the last row is a genuine
 *  residency exception (us → ap, a different region *family*); the rest is
 *  ordinary same-country cross-region inference. */
export const DEMO_CROSS_REGION: CrossRegionRow[] = [
  { region: "us-east-1", inferenceRegion: "us-west-2", calls: 340 },
  { region: "us-west-2", inferenceRegion: "us-east-1", calls: 210 },
  { region: "us-east-1", inferenceRegion: "us-east-2", calls: 150 },
  { region: "eu-west-1", inferenceRegion: "eu-central-1", calls: 88 },
  { region: "us-east-1", inferenceRegion: "ap-northeast-1", calls: 9 },
];

// --- control-plane audit -------------------------------------------------------

export const DEMO_CONTROL_PLANE: ControlPlaneRow[] = [
  { timestamp: hoursAgo(3), eventName: "PutModelInvocationLoggingConfiguration", identity: "AdminConsoleRole/jdoe", region: "us-east-1", sourceIp: "10.20.4.15" },
  { timestamp: hoursAgo(29), eventName: "UpdateGuardrail", identity: "SecurityAuditRole/session-audit-14", region: "us-east-1", sourceIp: "10.20.4.22" },
  { timestamp: hoursAgo(31), eventName: "CreateGuardrail", identity: "SecurityAuditRole/session-audit-14", region: "us-east-1", sourceIp: "10.20.4.22" },
  { timestamp: hoursAgo(80), eventName: "TagResource", identity: "AdminConsoleRole/asmith", region: "us-west-2", sourceIp: "10.20.4.31" },
  { timestamp: hoursAgo(140), eventName: "StartIngestionJob", identity: "RAGIngestionRole/svc-ingest-03", region: "us-east-1", sourceIp: "192.0.2.77" },
];

// --- reconciliation & account/region -----------------------------------------

/** CloudTrail counts every InvokeModel/InvokeModelWithResponseStream/Converse/
 *  ConverseStream event; ModelInvocationLog is the metering log. A small
 *  (~1.2%) gap is realistic — a handful of calls Bedrock accepted that never
 *  made it into the metering log. */
export const DEMO_RECONCILIATION: ReconciliationRow[] = [
  { source: "CloudTrail (invoke events)", invocations: 11_000 },
  { source: "ModelInvocationLog (metering)", invocations: 10_870 },
];

export const DEMO_ACCOUNT_REGION: AccountRegionRow[] = [
  { accountId: "111122223333", region: "us-east-1", calls: 5400, identities: 9 },
  { accountId: "444455556666", region: "us-east-1", calls: 2600, identities: 5 },
  { accountId: "777788889999", region: "ap-southeast-2", calls: 1305, identities: 3 },
  { accountId: "111122223333", region: "us-west-2", calls: 1200, identities: 4 },
  { accountId: "444455556666", region: "eu-west-1", calls: 900, identities: 3 },
];

// --- cross-region / exfiltration deep-dive -----------------------------------

const THIRD_PARTY_UA =
  "Boto3/1.34.98 Python/3.11.6 Botocore/1.34.98 Linux/5.10.220-188.869.amzn2.x86_64 exec-env/AWS_ECS_FARGATE";
const MARKETING_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const EXFIL_REGION = "us-east-1";
const EXFIL_INFERENCE_REGION = "ap-northeast-1";
const EXFIL_COUNTRY = regionCountry(EXFIL_INFERENCE_REGION);

/** The one residency-exception route from `DEMO_CROSS_REGION` (9 calls, 2
 *  identities, 2 source IPs) — the only slice the exfiltration deep-dive has
 *  data for, same as a real tenant where out-of-country inference is rare. */
export const DEMO_EXFIL_DESTINATIONS: ExfilDestinationRow[] = [
  {
    region: EXFIL_REGION,
    inferenceRegion: EXFIL_INFERENCE_REGION,
    destinationCountry: EXFIL_COUNTRY,
    calls: 9,
    identities: 2,
    sourceIps: 2,
    firstSeen: hoursAgo(125),
    lastSeen: hoursAgo(5),
  },
];

export const DEMO_EXFIL_ACTORS: ExfilActorRow[] = [
  {
    identity: "ThirdPartyIntegrationRole/session-ext-55",
    calls: 6,
    destinations: 1,
    sourceIps: 1,
    userType: "AssumedRole",
    userAgent: THIRD_PARTY_UA,
    client: classifyUserAgent(THIRD_PARTY_UA).label,
    human: classifyUserAgent(THIRD_PARTY_UA).human,
    lastSeen: hoursAgo(5),
  },
  {
    // Human-driven (browser/console) out-of-country call — the strongest
    // "human data left the country" signal the deep-dive flags.
    identity: "MarketingContentRole/session-77aa01",
    calls: 3,
    destinations: 1,
    sourceIps: 1,
    userType: "AssumedRole",
    userAgent: MARKETING_UA,
    client: classifyUserAgent(MARKETING_UA).label,
    human: classifyUserAgent(MARKETING_UA).human,
    lastSeen: hoursAgo(8),
  },
];

export const DEMO_EXFIL_TIMESERIES: GovTimeseries = {
  labels: DEMO_LABELS,
  series: [
    { key: "Same-country cross-region", values: [85, 60, 95, 100, 72, 55, 90, 98, 88, 45] },
    { key: "Out-of-country", values: [0, 0, 1, 2, 0, 0, 1, 0, 3, 2] },
  ],
};

const exfilDetailRow = (
  hAgo: number,
  identity: string,
  sourceIp: string,
  userAgent: string,
  eventName: string,
): ExfilDetailRow => ({
  timestamp: hoursAgo(hAgo),
  identity,
  sourceIp,
  userAgent,
  client: classifyUserAgent(userAgent).label,
  region: EXFIL_REGION,
  inferenceRegion: EXFIL_INFERENCE_REGION,
  destinationCountry: EXFIL_COUNTRY,
  eventName,
});

/** 9 raw out-of-country calls — 6 from the automated SDK actor, 3 from the
 *  human console actor — matching the call counts in DEMO_EXFIL_ACTORS exactly. */
export const DEMO_EXFIL_DETAIL: ExfilDetailRow[] = [
  exfilDetailRow(5, "ThirdPartyIntegrationRole/session-ext-55", "198.51.100.87", THIRD_PARTY_UA, "InvokeModel"),
  exfilDetailRow(29, "ThirdPartyIntegrationRole/session-ext-55", "198.51.100.87", THIRD_PARTY_UA, "InvokeModel"),
  exfilDetailRow(53, "ThirdPartyIntegrationRole/session-ext-55", "198.51.100.87", THIRD_PARTY_UA, "InvokeModel"),
  exfilDetailRow(77, "ThirdPartyIntegrationRole/session-ext-55", "198.51.100.87", THIRD_PARTY_UA, INVOKE_STREAM_EVENT),
  exfilDetailRow(101, "ThirdPartyIntegrationRole/session-ext-55", "198.51.100.87", THIRD_PARTY_UA, "InvokeModel"),
  exfilDetailRow(125, "ThirdPartyIntegrationRole/session-ext-55", "198.51.100.87", THIRD_PARTY_UA, "InvokeModel"),
  exfilDetailRow(8, "MarketingContentRole/session-77aa01", "203.0.113.19", MARKETING_UA, "Converse"),
  exfilDetailRow(56, "MarketingContentRole/session-77aa01", "203.0.113.19", MARKETING_UA, "ConverseStream"),
  exfilDetailRow(104, "MarketingContentRole/session-77aa01", "203.0.113.19", MARKETING_UA, "Converse"),
];

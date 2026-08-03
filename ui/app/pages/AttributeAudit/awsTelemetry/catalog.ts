/**
 * AWS Bedrock raw-telemetry coverage catalog — ported from the standalone
 * AWSBedrockApp's Telemetry-tab audit (`pages/Telemetry/catalog.ts`).
 *
 * Mirrors the architecture of the sibling OTel span-attribute catalog
 * (`../catalog.ts`) but audits raw AWS telemetry instead: CloudWatch
 * ModelInvocationLog fields, `cloud.aws.bedrock*` metrics, and Bedrock
 * CloudTrail event fields. Deliberately tenant-wide — only the global
 * Timeframe applies (no Segments/global-filter/Account/Model scoping), same
 * reasoning as the OTel audit's `ignoreGlobalFilter`: an existence/coverage
 * audit must see the whole fleet, not a filtered slice, or it risks reporting
 * a false gap.
 *
 * Two field-kind verdicts:
 *  - `logs` / `events` sections have a POPULATION (`section_rows`) and each
 *    field's presence is measured as a SHARE of it — three-way present /
 *    sparse / missing via the shared `classifyVerdict` (see `../coverage.ts`).
 *  - `metrics` sections have no population — a metric either delivered at
 *    least one datapoint in the window or it didn't (binary detected /
 *    not-detected), which `classifyVerdict(present, present ? 1 : 0)` already
 *    collapses to correctly (never "sparse" — a metric can't be "a little bit"
 *    detected).
 *
 * `required: false` fields (Optional) are opt-in AWS features (Guardrails, the
 * TPM-quota / log-delivery meta-metrics) — their absence is a healthy,
 * unalarming state, not a gap, so they're excluded from the "Required
 * coverage %" hero stat and never render as a red/critical verdict in the UI.
 */

export type AwsTelemetryKind = "logs" | "metrics" | "events";

export interface AwsTelemetryField {
  /** Flattened field path (post-parse for logs/events; metric key for metrics). */
  path: string;
  /** Display name. */
  name: string;
  /** One-line explanation of what this field buys you. */
  what: string;
  /** Required fields drive the hero "Required coverage %"; Optional never alarm. */
  required: boolean;
}

export interface AwsTelemetrySection {
  id: string;
  title: string;
  blurb: string;
  kind: AwsTelemetryKind;
  /** `fetch logs|events` prefilter (before parse). Unused for `metrics`. */
  prefilter?: string;
  /** `parse <field>, "JSON:<alias>"` — the alias prefixes every field path below. */
  parse?: string;
  /** Filter applied AFTER parse (fields only exist post-parse, e.g. eventSource). */
  postfilter?: string;
  fields: AwsTelemetryField[];
}

export const AWS_TELEMETRY_SECTIONS: AwsTelemetrySection[] = [
  {
    id: "model-invocation-logs",
    title: "Model Invocation Logs",
    blurb:
      "CloudWatch model-invocation logging — the metering record for every Bedrock call: who called it, which model, and how many tokens.",
    kind: "logs",
    prefilter: `contains(dt.da.aws.log_group, "bedrock") and contains(content, "ModelInvocationLog")`,
    parse: `content, "JSON:b"`,
    fields: [
      { path: "b[accountId]", name: "accountId", what: "Account attribution", required: true },
      { path: "b[modelId]", name: "modelId", what: "Model id", required: true },
      { path: "b[input][inputTokenCount]", name: "input.inputTokenCount", what: "Input token count", required: true },
      { path: "b[output][outputTokenCount]", name: "output.outputTokenCount", what: "Output token count", required: true },
      { path: "b[errorCode]", name: "errorCode", what: "Error code", required: true },
      { path: "b[identity][arn]", name: "identity.arn", what: "Caller identity ARN", required: true },
      { path: "b[input][cacheReadInputTokenCount]", name: "input.cacheReadInputTokenCount", what: "Prompt-cache read tokens", required: false },
      { path: "b[input][cacheWriteInputTokenCount]", name: "input.cacheWriteInputTokenCount", what: "Prompt-cache write tokens", required: false },
    ],
  },
  {
    id: "runtime-quota-metrics",
    title: "Runtime & Quota Metrics",
    blurb:
      "CloudWatch `cloud.aws.bedrock.*` metrics — throughput, latency, and TPM-quota pressure per model, independent of the invocation logs.",
    kind: "metrics",
    fields: [
      { path: "cloud.aws.bedrock.Invocations.By.ModelId", name: "Invocations.By.ModelId", what: "Per-model invocation count", required: true },
      { path: "cloud.aws.bedrock.InvocationLatency.By.ModelId", name: "InvocationLatency.By.ModelId", what: "Per-model invocation latency", required: true },
      { path: "cloud.aws.bedrock.TimeToFirstToken.By.ModelId", name: "TimeToFirstToken.By.ModelId", what: "Per-model time-to-first-token", required: true },
      { path: "cloud.aws.bedrock.InputTokenCount.By.ModelId", name: "InputTokenCount.By.ModelId", what: "Per-model input tokens", required: true },
      { path: "cloud.aws.bedrock.OutputTokenCount.By.ModelId", name: "OutputTokenCount.By.ModelId", what: "Per-model output tokens", required: true },
      // eslint-disable-next-line noSecrets/no-secrets -- public AWS CloudWatch metric name, not a secret
      { path: "cloud.aws.bedrock.EstimatedTPMQuotaUsage.By.ModelId", name: "EstimatedTPMQuotaUsage.By.ModelId", what: "Per-model TPM-quota pressure (absolute tokens/min)", required: false },
      // eslint-disable-next-line noSecrets/no-secrets -- public AWS CloudWatch metric name, not a secret
      { path: "cloud.aws.bedrock.ModelInvocationLogsCloudWatchDeliverySuccess", name: "ModelInvocationLogsCloudWatchDeliverySuccess", what: "Log-delivery pipeline health meta-metric", required: false },
    ],
  },
  {
    id: "guardrails-metrics",
    title: "Guardrails Metrics",
    blurb:
      "AWS Bedrock Guardrails metrics — an opt-in feature. Not-detected is a healthy state (Guardrails simply isn't configured), never a gap.",
    kind: "metrics",
    fields: [
      { path: "cloud.aws.bedrock_guardrails.Invocations.By.GuardrailArn.GuardrailVersion", name: "Invocations.By.GuardrailArn.GuardrailVersion", what: "Per-guardrail invocation count", required: false },
      { path: "cloud.aws.bedrock_guardrails.InvocationsIntervened.By.GuardrailArn.GuardrailVersion", name: "InvocationsIntervened.By.GuardrailArn.GuardrailVersion", what: "Per-guardrail intervention count", required: false },
      // eslint-disable-next-line noSecrets/no-secrets -- public AWS CloudWatch metric name, not a secret
      { path: "cloud.aws.bedrock_guardrails.InvocationLatency.By.GuardrailArn.GuardrailVersion", name: "InvocationLatency.By.GuardrailArn.GuardrailVersion", what: "Per-guardrail latency", required: false },
      // eslint-disable-next-line noSecrets/no-secrets -- public AWS CloudWatch metric name, not a secret
      { path: "cloud.aws.bedrock_guardrails.TextUnitCount.By.GuardrailArn.GuardrailVersion", name: "TextUnitCount.By.GuardrailArn.GuardrailVersion", what: "Per-guardrail text units evaluated", required: false },
    ],
  },
  {
    id: "access-governance",
    title: "Access & Governance",
    blurb:
      "Bedrock CloudTrail events — who called Bedrock, from where, and with what outcome. Powers the AWS Bedrock page's Access & Governance sub-tab.",
    kind: "events",
    prefilter: `cloud.provider == "aws"`,
    parse: `data, "JSON:ct"`,
    postfilter: `ct[eventSource] == "bedrock.amazonaws.com"`,
    fields: [
      { path: "ct[eventName]", name: "eventName", what: "API action name", required: true },
      { path: "ct[userIdentity][arn]", name: "userIdentity.arn", what: "Caller identity ARN", required: true },
      { path: "ct[recipientAccountId]", name: "recipientAccountId", what: "Account attribution", required: true },
      { path: "ct[awsRegion]", name: "awsRegion", what: "Request region", required: true },
      { path: "ct[sourceIPAddress]", name: "sourceIPAddress", what: "Caller source IP", required: true },
      { path: "ct[errorCode]", name: "errorCode", what: "Error code", required: true },
      { path: "ct[userIdentity][sessionContext][attributes][mfaAuthenticated]", name: "userIdentity.sessionContext.attributes.mfaAuthenticated", what: "MFA posture", required: true },
      { path: "ct[readOnly]", name: "readOnly", what: "Read-only vs. control-plane change flag", required: true },
      { path: "ct[serviceEventDetails][AdditionalEventData][additionalEntries][inferenceRegion]", name: "serviceEventDetails…inferenceRegion", what: "Actual inference region (cross-region / data-residency detection)", required: false },
    ],
  },
];

export const AWS_TELEMETRY_TOTAL_FIELDS = AWS_TELEMETRY_SECTIONS.reduce(
  (sum, s) => sum + s.fields.length,
  0,
);

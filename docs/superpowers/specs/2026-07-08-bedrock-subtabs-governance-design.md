# AWS Bedrock page — sub-tabs + Access & Governance + Runtime 2.0 augmentation

**Date:** 2026-07-08
**Branch:** `feat/aws-bedrock-logs-metrics`
**Tenant for validation:** `fifththird-preprod` (due93336), 7-day windows (data is sparse). CloudTrail + metrics + ModelInvocationLog all confirmed present.

## Goal

Turn the single AWS Bedrock page into a **two-sub-tab** page inside the same `/bedrock` route:

1. **Runtime Observability & Cost & Usage** (default) — today's page, extracted intact + augmented with the three Runtime 2.0 metrics we lack (TPM quota, log-delivery health, latency/TTFT bands + per-model summary). Also fixes the over-granular cost chart.
2. **Access & Governance** (new) — 100% CloudTrail (`fetch events`, `eventSource=="bedrock.amazonaws.com"`), reorganized as a **problem-solving narrative** that incorporates every tile from the source dashboard.

Solve for four problem themes (all validated against real data): **security & governance, reliability & quota, data residency & compliance, cost & waste.**

## Validated data facts (fifththird-preprod, last 7d)

- CloudTrail Bedrock events: **2125** — ConverseStream 1740, InvokeModel 381, Converse 2, StartIngestionJob 2 (the 2 control-plane writes, `readOnly==false`).
- Identities: 19 · Source IPs: 33 · Accounts: 4 (`975049911737, 637423486688, 886110332321, 516035591078`).
- Errors: AccessDenied **15**, ValidationException 13. **No throttling in 7d** → throttling card must have a graceful "healthy/empty" state.
- MFA: 0 true, 1718 false, 407 null → all programmatic/role-session access (frame Non-MFA as informational, note IAM roles carry no MFA).
- Cross-region inference (851 events): us-east-1→us-east-2 **759**, →us-west-2 12, →ap-northeast-2 **1**, →ap-southeast-4 **1**. The two AP routes = data-residency flags for a US bank.
- Reconciliation: CloudTrail invoke events **2123** vs ModelInvocationLog **1292** → ~39% logging blind spot. Both sources agree on the same 4 accounts.
- New metrics confirmed: `EstimatedTPMQuotaUsage.By.ModelId` (peaks 232K/172K/43K… absolute TPM, **not %** → quota ceiling is the one placeholder), `ModelInvocationLogsCloudWatchDeliverySuccess` (628), `TimeToFirstToken.By.ModelId` + `InvocationLatency.By.ModelId` (real per-model bands).

## Architecture

```
BedrockPage (shell)
├─ header: title + BedrockSubTabs (segmented) + ScopeSelectors (Model hidden on governance)
├─ view === "runtime"    → BedrockRuntimeView  (existing zones + new runtime cards)
└─ view === "governance" → BedrockGovernanceView (new, CloudTrail)
```

- **Tab state:** `useState<"runtime"|"governance">`, default `runtime`, mirrored to URL `?view=` for deep-linking (read on mount, write on change). No new nav entry / route.
- **Scope:** Account + timeframe shared across both tabs. Model selector rendered only when `view==="runtime"`. Account option list = union of ModelInvocationLog facets + CloudTrail accounts (both = same 4 here, union is defensive).
- **Segmented control:** reuse the `role="radiogroup"` pill pattern from `pages/Models/ModelTypeSegmented.tsx`.

## Data layer (new: `ui/app/bedrock/governance/`)

All CloudTrail queries share this base (validated). `IGNORE` flags + `samplingRatioOverride:1` (exact security counts), like `useBedrock.ts`.

```
fetch events, from: <tf.from>, to: <tf.to>
| filter cloud.provider == "aws"
| parse data, "JSON:ct"
| filter ct[eventSource] == "bedrock.amazonaws.com"
| fieldsAdd
    eventName=ct[eventName], arn=ct[userIdentity][arn], accountId=ct[recipientAccountId],
    region=ct[awsRegion], sourceIp=ct[sourceIPAddress], errorCode=ct[errorCode],
    mfa=ct[userIdentity][sessionContext][attributes][mfaAuthenticated],
    inferenceRegion=ct[serviceEventDetails][AdditionalEventData][additionalEntries][inferenceRegion],
    readOnly=ct[readOnly]
| fieldsAdd identity_name = arrayLast(splitString(arn, "/"))
| filter in(accountId, array(<accounts>))   // only when accounts selected
```

**Query builders (`governance/queries.ts`):** `buildGovKpisQuery` (single summarize: total, distinct identities/ips, errored, non-mfa, cross-region), `buildApiActionsQuery` (by eventName), `buildApiActionsTimeseriesQuery` (makeTimeseries by eventName), `buildTopIdentitiesQuery`, `buildTopSourceIpsQuery`, `buildIdentityMfaQuery`, `buildAccessDeniedQuery` (errorCode contains AccessDenied, by identity/ip/eventName), `buildThrottleQuery` (errorCode contains Throttling/TooManyRequests), `buildErrorsTimeseriesQuery` (by errorCode), `buildCrossRegionQuery` (by region, inferenceRegion), `buildControlPlaneQuery` (readOnly==false, recent 50), `buildReconciliationQuery` (CloudTrail invokes append ModelInvocationLog count), `buildActivityByAccountRegionQuery`.

**Parsers (`governance/parse.ts`):** pure functions record[]→typed rows, TDD'd. **Hooks (`governance/useGovernance.ts`):** one hook per query via `useScopedDql` + parser, memoized (mirror `useBedrock.ts`).

**Region policy helper:** `APPROVED_REGIONS = new Set(["us-east-1","us-east-2","us-west-1","us-west-2", ...us-* ])`; `isResidencyException(region, inferenceRegion) = inferenceRegion !== region && !inRegionFamily(...)`. Country grouping by region prefix (`us`,`eu`,`ap`,…). Any `ap-*`/`eu-*` inference for a `us-*` request = flagged.

## Runtime augmentation (new metric builders in `ui/app/bedrock/runtimeMetrics.ts` + parse)

- `buildTpmByModelQuery` — `timeseries max(EstimatedTPMQuotaUsage.By.ModelId) by:{ModelId}` → peak per model. Ceiling unknown → show absolute peak + "% of quota unavailable — needs quota limit" note.
- `buildLogDeliveryQuery` — `timeseries sum(ModelInvocationLogsCloudWatchDeliverySuccess)` → total + sparkline.
- `buildLatencyBandsQuery` / `buildTtftBandsQuery` — min/avg/max over time.
- `buildPerModelSummaryQuery` — invocations, in/out tokens, cache r/w, latency, ttft by ModelId (already in dashboard tile 19).

## Governance view (narrative, incorporates every source tile)

1. **Sub-header stat line** — `N calls · I identities · P IPs · A accounts · source: CloudTrail`.
2. **KPI band (6)** — API Calls, Distinct Identities, Distinct Source IPs, Errored/Denied (warn>0), Non-MFA (info + tooltip), Cross-Region (warn if residency exceptions). `GovKpiBand`.
3. **Insight cards** (problem-solving spine, responsive grid):
   - `GovAccessDeniedCard` — AccessDenied by identity/IP/action; frames "policy denial (expected)" vs "broken pipeline".
   - `GovAnomalousAccessCard` — identities × source IPs × MFA; highlight identity fan-out across many IPs / rare IPs (LLM-jacking / shadow-AI signal). Headline security card.
   - `GovDataResidencyCard` — region→inferenceRegion routing; flag out-of-country (ap-*, eu-*) against approved set.
   - `GovThrottlingCard` — throttling errorCode table; **empty-state "no throttling — healthy"**; cross-links to Runtime TPM card.
4. **Activity & Identity** (`GovActivityDetail`) — API actions bar, calls-over-time-by-action line, top identities bar, top source IPs table, access-by-identity-&-MFA table.
5. **Security & Compliance** (`GovSecurityDetail`) — errors/denials-over-time line, control-plane write-event audit table.
6. **Reconciliation bridge** (`GovReconciliation`) — CloudTrail-invokes vs ModelInvocationLog bar (logging blind spot), activity-by-account-&-region table.

Guardrail/PII coverage → cross-link to the existing `BedrockGuardrailsSummary` (already `cloud.aws.bedrock_guardrails.*`), not a fake card.

## Runtime view (existing extracted + new)

`BedrockRuntimeView` = current zones (Hero, KpiRow, CostZone, AgentSessionTable, PerfZone, GuardrailsSummary, Findings) **plus**: `BedrockQuotaCard` (TPM pressure by model), `BedrockLogDeliveryCard` (delivery health), and PerfZone gains latency/TTFT min·avg·max bands + per-model summary table. Cost chart fixed (below).

## Cost-chart granularity fix (`bedrock/queries.ts` + `BedrockCostChart.tsx`)

Root cause: `bedrockCostIntervalSec` returns `3600` (1h) for any window `< 14d` → 7d = 168 columns that overflow the container (min 4px+gap ≈ 1340px > width) and give unreadable repeating-time axis labels.

Retune ladder to keep bucket count ~≤30 and use **daily buckets for multi-day windows**:
```
<=2h → 300 (5m)      <=12h → 1800 (30m)     <2d → 3600 (1h)
<4d  → 21600 (6h)    else  → 86400 (1d)      // 7d → 7 cols, 30d → 30 cols
```
Axis labels: for multi-day windows show day (`M/D`), for sub-day show time — `shortDay` already distinguishes; ensure daily buckets render `M/D`. Update `series.test.ts` / interval tests.

## Testing

TDD the pure logic: `governance/parse.ts`, `bedrockCostIntervalSec` ladder, region-policy helper, runtime metric parsers. Light render tests for band/reconciliation folds. All existing Bedrock tests must stay green. No build/typecheck run inside fan-out agents — integrator runs it once.

## Non-goals / honest placeholders

- TPM quota **ceiling %** (need the per-model quota limit — not in telemetry). Show absolute peak.
- Provisioned-throughput utilization card — skip (no PT metric in scope).
- Prompt-level PII detection — cross-link to Guardrails summary instead.

## Execution

- **Phase 0 (main loop):** data layer (queries/parse/hooks + tests, validated DQL), runtimeMetrics, sub-tab shell, page refactor, RuntimeView, GovernanceView, `GovKpiBand` as the style-reference component; all other leaf components created as compiling stubs. Cost-chart fix. PerfZone augmentation.
- **Phase 1 (Workflow, sonnet, parallel — one distinct new file per agent):** implement the stub governance components + the 2 runtime cards, mirroring `GovKpiBand` + existing Bedrock components (`BedrockKpiRow`, `BedrockPerfZone`, `StatTile`, `theme/palette`, `theme/statusColor`, chart primitives).
- **Phase 2 (main loop):** integrate, typecheck, `npm test`, build, deploy to ualpre, visual verify.

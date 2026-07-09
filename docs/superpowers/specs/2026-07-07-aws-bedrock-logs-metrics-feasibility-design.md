# AWS Bedrock Logs + Metrics — Feasibility Study & Phase‑1 Page Design

**Date:** 2026‑07‑07
**Branch:** `feat/aws-bedrock-logs-metrics`
**Customer / tenant:** Fifth Third Bank — `due93336.apps.dynatrace.com` (dtctl context `fifththird-preprod`)
**Reference span data:** ualpre (`bos_spans` bucket), used only as the OpenLLMetry parity target
**Status:** Design validated via visual brainstorming; ready for implementation planning

---

## 1. Summary & verdict

**GO** for a dedicated **AWS Bedrock** page that reproduces the customer's cost/usage analytics inside AI Observability 3.0 — sourced from **Bedrock model‑invocation logs + `cloud.aws.bedrock.*` metrics** — and *augments* it with latency/TTFT/TPM signals their dashboard lacks and agent‑session attribution their dashboard only half‑exposes.

The study was driven by a real problem: 5/3 has thin OpenLLMetry **span** data, but rich Bedrock **logs**. The pivotal finding is that, for a Bedrock workload, **the logs are a near‑superset of the Bedrock spans** — so building on logs is not a downgrade. The analytics that logs *can't* feed (prompt/response content, tool/agent topology, trace waterfall, evaluations) are unreachable because that telemetry **does not exist for this customer in either logs or spans** — not because of a logs‑vs‑spans limitation.

Delivery is **phased** (per decision in §11):
- **Phase 1 (this spec):** a self‑contained AWS Bedrock page. Lowest risk, fastest value.
- **Phase 2 (direction only):** generalize the page's data layer into a `BedrockSource` behind a Tweaks **logs⇄spans** source toggle so existing pages can opt in. Phase 1 builds the data layer as a clean abstraction so phase 2 is a refactor, not a rewrite.

---

## 2. Context & motivation

- 5/3 runs **Bedrock AgentCore** agents (identities like `bedrock-agentcore-apollo-agent-session`, `…-pr-agent-session`). We are already deploying this app to their tenant.
- They have a customer‑authored dashboard, **"AWS Bedrock — Cost & Usage 2.0"** (29 tiles). Analysis of its DQL shows it is **100% log‑based** — every data tile is `fetch logs | filter contains(content,"ModelInvocationLog") | parse content,"JSON:bedrock" | …` with cost computed as `tokens × per‑model editable rate`. It references **zero** `cloud.aws.bedrock.*` metrics. It therefore already proves the logs are parseable into ~24 cost/usage analytics.
- Goal: determine whether we can "solution off these logs and metrics" the analytics the app does from spans, and where those views best fit.

---

## 3. Data sources (evidence from the live tenant, 7‑day window)

### 3.1 Bedrock model‑invocation logs — **metadata‑only**
- **Source:** log group `/aws/bedrock/model-invocations`, `dt.da.source = aws-log-ingest` (single group; no separate guardrail/agent log groups).
- **Schema** (`schemaType=ModelInvocationLog`, `schemaVersion=1.0`), parse via `parse content, "JSON:b"`:
  ```
  timestamp, accountId, region, requestId, operation (ConverseStream|Converse|InvokeModel),
  modelId,
  input:  { inputContentType, inputTokenCount, cacheReadInputTokenCount, cacheWriteInputTokenCount },
  output: { outputContentType, outputTokenCount },
  identity: { arn },
  inferenceRegion, schemaType, schemaVersion
  ```
- **Coverage (7d):** 934 records; **4 accounts** (`975049911737` dominant ≈ 82%, `637423486688`, `516035591078`, `886110332321`); **12 models**; **13 agent‑session identities**; 1 region; ~133 records/day.
- **Confirmed absent:** `withInputBody = 0/934`, `withOutputBody = 0/934`, `withStopReason = 0` → **no prompt/completion content, ever**. `withErrorCode = 6/934` (~0.6%) → error signal exists but is rare. **No latency/duration field.**
- **modelId arrives in two forms** that must be normalized to one rate‑card key: short (`us.anthropic.claude-sonnet-4-6`, `amazon.titan-embed-text-v1`) and full inference‑profile ARN (`arn:aws:bedrock:us-east-1:637423486688:inference-profile/us.anthropic.claude-sonnet-4-20250514-v1:0`).
- **Cache tokens are present** (`cacheReadInputTokenCount`, `cacheWriteInputTokenCount`) — enables prompt‑cache analytics and the cache‑savings visualization.
- **`identity.arn`** encodes the **agent session** (`assumed-role/<Role>/<session-name>`), not a human user. This is the attribution unit.

### 3.2 `cloud.aws.bedrock.*` metrics — **present and carrying data**
> Note: namespace is **`cloud.aws.bedrock`** (singular), not `clouds.aws.bedrock`.

14 distinct keys (7d), dimensioned `By: ModelId`:
- `Invocations`, `Invocations.By.ModelId`, `InputTokenCount.By.ModelId`, `OutputTokenCount.By.ModelId`, `CacheReadInputTokenCount.By.ModelId`, `CacheWriteInputTokenCount.By.ModelId`
- **`InvocationLatency.By.ModelId`** and **`TimeToFirstToken.By.ModelId`** — fill the latency gap the logs lack (verified real values, e.g. Opus‑4‑8 avg ≈ 22.5 s, Sonnet‑4‑6 ≈ 5.8 s; TTFT Opus ≈ 20 s, Sonnet ≈ 4.4 s). **Caveat:** measured values are averages; whether P95/percentile granularity is available depends on the ingested metric statistic — confirm during implementation and fall back to avg/max if percentiles aren't present. (Where the design says "P95", read as "the best available latency percentile/statistic".)
- **`EstimatedTPMQuotaUsage.By.ModelId`** — throughput‑quota headroom.
- `ModelInvocationLogsCloudWatchDeliverySuccess` — delivery meta.
- Guardrails: `bedrock_guardrails.Invocations|InvocationsIntervened|TextUnitCount|InvocationLatency.By.GuardrailArn.GuardrailVersion`.

**Absent (7d catalog scan):** no Bedrock `InvocationClientErrors` / `InvocationServerErrors` / `InvocationThrottles`. The only Error/Throttle metrics in the tenant are for API Gateway, Firehose, Lambda, NAT Gateway. → **Errors are log‑only** (`errorCode`); **throttles are not observable** without an AWS‑side integration change.

### 3.3 Guardrails
Already modeled in the app as AWS Bedrock metrics only (no span attributes) — the Bedrock page reuses that existing feature for a summary + links out.

---

## 4. Key insight — the logs are a near‑superset of the Bedrock spans

On ualpre, `bos_spans` is **96.4% AWS Bedrock spans** (2.70M / 2.8M in 7d). Those Bedrock spans carry **less** than the Bedrock logs:

| For one Bedrock model call | Bedrock **span** (ualpre) | Bedrock **log** (5/3) |
|---|:--:|:--:|
| model, input/output tokens | ✅ | ✅ |
| cache read/write tokens | ❌ | ✅ |
| accountId, region | ❌ | ✅ |
| identity ARN (agent session) | ❌ | ✅ |
| latency | ✅ span duration | ⚠️ via metric |
| `span.parent_id` (links call into an agent tree) | ✅ | ❌ |
| prompt/response content, tools, framework | ❌ | ❌ |

The rich features in the app (content, tool topology, agent loops, MCP health, trace waterfall) are powered by the **~8% non‑Bedrock** OpenLLMetry/LangGraph spans (OpenAI/Sierra/Anthropic‑direct) — telemetry 5/3 does not emit. So those gaps are a **customer‑instrumentation** limitation, not a data‑model one, and switching them to spans would not fix them.

---

## 5. Parity matrix (app analytics → Bedrock source → verdict)

The recon mapped ~120 app views across 11 page areas and cataloged the span parity target. Grouped verdict:

**🟢 Fully reproducible (logs + `cloud.aws.bedrock.*` metrics)**
- **Models / FinOps (all):** est. cost, $/call, cost‑efficiency, top spenders, provider mix, cost concentration, prompt‑cache panel, model A/B swap, daily cost. Cost already computes as `tokens × pricing.ts`; logs carry the cache tokens `cacheAccounting.ts` needs.
- **Golden signals:** invocations, tokens (in/out/cache), est. spend, **P95 latency & TTFT (metrics)**, token efficiency, model mix, activity histogram, provider mix, top models.
- **Summary** cost/token/provider/spend/projection scorecard tiles; **Guardrails**.
- The customer's own 24‑tile dashboard.

**🟡 Partial / dimension‑swap**
- **Errors:** log `errorCode` only (~0.6%; no metric) — a floor, not a full rate.
- **"By service" → "by account / by agent‑session":** logs have no service entity; `accountId` (4) and `identity.arn` (13 sessions) are the attribution axes.
- **Latency:** metric is `By.ModelId` only — great per‑model P95, but no per‑request/per‑user latency distribution.

**🔴 Not reachable (no such telemetry; spans wouldn't help this customer either)**
- Prompts **content** views, Agents **tool/loop topology**, Tools/**MCP health**, Pulse **8‑tier architecture map**, **trace waterfall**, **RAG** panels, **evaluations/quality**.

---

## 6. Phase‑1 design — the AWS Bedrock page

### 6.1 Information architecture
- **New left‑nav tab: "AWS Bedrock".**
- **Detection/gating:** the tab enables when the tenant has Bedrock signals — `/aws/bedrock/model-invocations` logs and/or `cloud.aws.bedrock.*` metrics. Absent → a missing‑data hint consistent with the app's existing empty‑state pattern (not a broken page).
- **Own scope, not the span global filter:** page scope controls are **Account (multi), Model (multi), Time range**. Because Bedrock log/metric queries use no `gen_ai.*` attributes, the page bypasses the span‑oriented global attribute filter and bucket/segment scoping — exactly as `guardrails/useGuardrails.ts` already does (`ignoreGlobalFilter + ignoreBucketFilter + ignoreSegments`).

### 6.2 Layout — narrative arc (`what → who → how efficiently → what to watch`)
| # | Zone | Source | Notes |
|---|------|--------|-------|
| 0 | Header + scope | — | "◆ Logs + Metrics" source badge; account/model/time chips; coverage line (records/accounts/models/sessions). |
| 1 | **Narrative hero** | logs+metrics | Cost hero ($ + WoW + 30‑day projection) **plus 2–3 computed insight sentences** (e.g. "Opus‑4‑8 = 48% of spend on 7% of calls"; "Opus ~4× slower, p95 22.5 s vs 5.8 s"; "caching active, ~1,928 cached tok/call"). This is where the data tells the story. |
| 2 | **Golden‑signal KPI row** | logs+metrics | Invocations, Tokens, Est. cost, P95, TTFT, Error rate, TPM headroom, Sessions — each with sparkline, ⓘ, and click‑to‑modal. |
| 3 | **Cost & Usage** | logs | Daily cost by model (stacked, with the **cache ghost** — §6.4), cost share by model, cost by account, input/output/cache split, blended $/1M, projection. |
| 4 | **Agent‑session leaderboard** | logs (+metric latency) | First‑class, **scrollable** table: session · account · models · invocations · tokens · cache% · est. cost · p95 · err. Row → session detail. The differentiator over the raw dashboard. |
| 5 | **Performance & reliability** | metrics (+log errorCode) | P95 latency by model, TTFT by model, TPM headroom over time, error count from `errorCode`. |
| 6 | **Guardrails** | metrics | Reuses existing guardrails feature: invocations, intervened %, text units, guardrail p95. |
| 7 | **Auto‑surfaced findings** | derived | The story computed: concentration risk, caching win, TPM watch, and the honest coverage‑gap card (enable input/output data logging to unlock Prompts/Agent‑tool views). |

### 6.3 Cost model — platform‑aware, accurate where priced, honest where not
- **Normalize** each `modelId` to a canonical rate‑card key (`normalizeModelKey`): strip `arn:…:inference-profile/`, region prefixes (`us.`, `global.`), and version suffixes so both ID forms map to one key.
- **Platform‑aware pricing (decision):** pricing gains a **platform** dimension — `(normalizeModelKey, platform)` with `platform ∈ { direct, aws_bedrock, azure, gcp_vertex }`. The Bedrock page looks up with `platform = "aws_bedrock"` (platform is known from the `modelId` provider prefix / `gen_ai.provider.name`). **Fallback chain:** `(model, platform)` → `(model, direct)` → **estimated**. So Claude‑on‑Bedrock correctly inherits the Direct Claude price (accurate today) while Amazon **Titan/Nova** (Bedrock‑only) get explicit `aws_bedrock` entries. The same mechanism later covers **Azure OpenAI / GCP Vertex** with no redesign (same model, different platform price; platform‑exclusive models like Gemini/Titan/Nova).
- **Match** against the app's **Models cost list** (`data/pricing.ts` + the editable Models cost modal). Priced `(model,platform)` → **exact**; missing platform falls back to **Direct**; else a **fallback default rate** flagged with the app‑standard **`est`** whenever any estimated model is in scope.
- **Cost formula (per model, reusing `pricing.ts` + `cacheAccounting.ts`):**
  `cost = Σ ( inputTokens×inRate + outputTokens×outRate + cacheReadTokens×cacheReadRate )` (+ cache‑write rate where the price book defines one), using the platform‑resolved rate.
- **Editor:** the Models cost list gains a per‑row **platform selector** and **grouped sections** (Direct / AWS Bedrock / Azure / GCP). The Bedrock page's "＋ Add pricing in Models cost list →" CTA deep‑links here pre‑filtered to AWS Bedrock. Hero shows the split, e.g. `$4.1k est = $3.6k priced + $0.5k estimated (2 models need pricing)`.
- **Decisions (default):** unpriced models use a **fallback rate**, counted in the total and flagged `est` (not excluded, so totals aren't misleadingly low).

### 6.4 Cache‑savings "ghost" visualization
On the daily cost‑by‑model stacked bar, add a **translucent hatched "ghost" segment on top** of each day's solid stack representing **cost avoided by cache‑read tokens**. Bar top (incl. ghost) = the **counterfactual no‑cache cost**; solid top = **actual**; the gap reads instantly as savings ("tall ghost = big savings"). Tooltip shows per‑model rows, actual billed total, and a `− $X saved by caching` line.
- **Decision (default):** ghost = *cost avoided vs. paying full input price for those cached tokens* = `cacheReadTokens × (inRate − cacheReadRate)`. (Simpler/standard framing; the stricter "vs. no cache at all incl. write overhead" is an alternative if desired.)

### 6.5 Interaction standards (apply to every viz on the page)
- **ⓘ info affordance on every tile:** hover popover with **What** (plain‑language definition), **How** (formula / metric key), **Source** badge (◆ logs vs ◆ metric), and **caveats** (e.g. "P95 is metric‑derived & per‑model — can't split by user/session"; "error rate is a floor").
- **Click a tile → full‑screen breakdown modal:** beautiful charts (over‑time, by‑model, by‑account, by‑session, input/output/cache split), key stats, and a "how it's calculated" footer.
- **Standard app hover tooltip** on all charts/series (the shared component used elsewhere).
- **Scrollable** lists (agent‑session leaderboard scrolls internally; no max‑N clipping).

---

## 7. Architecture & module plan

**Data layer (new, `ui/app/pages/Bedrock/` + a small shared `bedrock/` data module):**
- **Query builders** — pure functions returning DQL:
  - Logs: `fetch logs | filter contains(dt.da.aws.log_group,"bedrock") | filter contains(content,"ModelInvocationLog") | parse content,"JSON:b" | summarize …` (filter on the indexed `dt.da.aws.log_group` first to prune scan — a bedrock‑only filter kept the 7‑day scan small vs. a 58 GB unfiltered content scan).
  - Metrics: `timeseries …(cloud.aws.bedrock.*…), by:{ModelId}` for latency/TTFT/TPM/token/invocation series.
- **Model normalizer** — `normalizeBedrockModelId(modelId) → rateCardKey` (ARN/inference‑profile/region/version stripping). Unit‑tested against both observed ID forms.
- **Cost calc (shared‑layer change)** — extend `data/pricing.ts` with a **platform dimension**: `ModelPricing` grows a platform notion, `PRICING` / `PRICING_OVERRIDES` become keyed on `(platform, modelKey)`, and `costOf(input, output, model, platform = "direct")` takes a platform arg (the default keeps every existing call site working). `normalizeModelKey` is unchanged. Reuse `detection/cacheAccounting.ts` for cache tokens. Add `bedrockCost(rows, priceBook)` → `{ priced, estimated, savedByCache }`. The **Models cost editor** (`ModelsTilesRow` / `FinOpsTilesRow`) gains the platform selector + grouped sections. *Note: this is a shared enhancement — motivated by Bedrock, but it makes the whole app's cost multi‑cloud‑accurate (Models, Summary, FinOps all benefit).*
- **Transport** — route every query through `scope/useScopedDql` with the guardrails opt‑outs so the page gets timeframe + scan telemetry + react‑query caching for free while bypassing span scoping.
- **Detection/gating** — extend `detection/` capability probes with a Bedrock‑source probe (log group + metric presence) to drive tab enablement and empty‑states.

**Phase‑2 seam (documented, not built):** the phase‑1 data module is the embryonic `BedrockSource`. Phase 2 lifts the "source" concept into a shared interface (`SpanSource` | `BedrockSource`) selected by a Tweaks toggle; existing pages opt in per‑tile, rendering the 🟢 subset from logs and showing per‑tile empty‑states where logs can't match spans. The narrow seam already exists (`useScopedDql` carries non‑span queries untouched); phase 2 widens it to a source strategy.

---

## 8. Testing (TDD, matching the app's conventions)
- **Pure units first:** `normalizeBedrockModelId` (both ID forms → one key; unknown → estimated), `bedrockCost` (priced vs. fallback split, cache‑savings math), query builders (snapshot the generated DQL, assert the bedrock log‑group prefilter and metric keys).
- **Hooks:** `useBedrockOverview`, `useBedrockCost`, `useAgentSessions`, `useBedrockPerf` with mocked `useScopedDql` responses.
- **Empty‑state / gating:** page renders the missing‑data hint when the Bedrock‑source probe is negative.
- Validate representative DQL against the live tenant (`fifththird-preprod`) before wiring, as done in this study.

---

## 9. Out of scope (Phase 1) — not reachable from this customer's telemetry
Prompt/response **content** views, **tool/agent topology**, **agent loop detection**, **MCP health**, **trace waterfall / span tree**, **RAG / vector‑store** panels, **evaluations / quality** scores. These require OpenLLMetry span richness (content, `gen_ai.tool.*`, `traceloop.*`, `span.parent_id`, `gen_ai.evaluation.*`) that 5/3 does not emit. The page names this explicitly in the zone‑7 coverage‑gap finding rather than showing empty tiles.

## 10. Recommendations to 5/3 (surface in‑app + in the readout)
1. **Enable Bedrock "model input/output data" logging** (CloudWatch/S3 data delivery) to add prompt/response bodies → unlocks Prompts content, and richer per‑call analysis.
2. **Enable Bedrock error/throttle metrics** in the AWS→Dynatrace integration (`InvocationClientErrors`, `InvocationServerErrors`, `InvocationThrottles`) → turns the 🟡 error/throttle signals green.
3. **Add missing model pricing** (per platform) to the Models cost list — e.g. Amazon Titan/Nova Bedrock rates — → converts `est` cost to exact.

## 11. Open decisions (resolved defaults; confirm in review)
- **End state:** *Both, explicitly phased* — phase 1 page now, phase 2 toggle later. ✅ (user‑selected)
- **Platform‑specific pricing:** *platform dimension on the rate card (model × platform); fallback (model,platform)→(model,direct)→estimated; editor gets a platform selector + grouped Direct/Bedrock/Azure/GCP sections; generalizes to Azure & GCP.* ✅ (user‑selected) — shared‑layer change, see §6.3/§7.
- **Ghost semantics:** *vs. full input price* (default). Alt: vs. no‑cache incl. write overhead.
- **Unpriced models:** *fallback rate, counted, flagged `est`* (default). Alt: exclude until priced.
- **Nav placement:** new top‑level "AWS Bedrock" tab (proposed).
- **Guardrails:** summarize on‑page + link to existing Guardrails feature (proposed).

## 12. Success criteria
- The AWS Bedrock page reproduces the customer's "Cost & Usage 2.0" analytics inside the app, in the app's design language, at parity or better (adds latency/TTFT/TPM + agent‑session attribution + cache‑savings story).
- Cost is exact for priced models and transparently estimated otherwise, with a clear path to make it exact.
- Every tile explains itself (ⓘ) and drills down (modal); all viz use the standard tooltip.
- The data layer is isolated enough that phase 2 (source toggle) is a refactor, not a rewrite.
- Honest boundaries: unreachable analytics are named, with concrete customer actions to unlock them.

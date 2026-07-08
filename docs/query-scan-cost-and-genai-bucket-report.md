# Query Scan-Cost & `genai_spans` Bucket Report

**Environment:** united nonprod (ualpre, `https://ualpre.apps.dynatrace.com`)
**Date:** 2026-07-04
**Method:** each page's dominant data query (the one that drives its scan footprint) plus the global capability probe that runs on every page load, executed unsampled (`samplingRatio:1`), no global filters, across timeframes {1h, 2h, 6h, 24h} and scan limits {2, 5, 500 GB}. Metrics read directly from Grail response metadata (`scannedBytes`, `executionTimeMilliseconds`, `scannedRecords`, scan-limit-hit notification). Durations are single-run wall-clock and vary ±20–30%; treat as orders of magnitude.

Queries measured, one representative per page:
| Page | Representative query | Source |
|---|---|---|
| *Global* | Capability probe (runs on every page) | `ui/app/scope/CapabilityContext.tsx` |
| Pulse | `buildSummaryQuery` (9-tile summary) | `ui/app/pages/Pulse/dataQueries.ts` |
| Explorer | `buildAIServicesQuery` | `ui/app/pages/Explorer/queries.ts` |
| Agents | `buildAgentsQuery` | `ui/app/pages/Agents/queries.ts` |
| Models | `buildModelsQuery` | `ui/app/pages/Models/queries.ts` |
| Prompts | `buildPromptsListQuery` | `ui/app/pages/Prompts/queries.ts` |
| Attribute Audit | `buildSectionQuery` (llm section) | `ui/app/pages/AttributeAudit/queries.ts` |

> Caveat: several pages fire many more queries per load (Pulse 30+, Attribute Audit ~10 — one per catalog section). The numbers here are the *dominant* scan per page, not the whole page's total.

---

## Executive summary

1. **On the shared `spans` stream, the scan-limit selector is a correctness dial, not a speed dial.** ualpre's spans bucket is enormous (~66–70 GB **per hour**; 8.6 B records/24h) and dominated by non-AI spans. At **2 GB and 5 GB every query caps at every timeframe — even 1 hour** — and the AI spans are sparse enough that the budget is exhausted before reaching them, so pages return **empty or partial** data (Agents = 0 rows at 2 GB and 5 GB, all timeframes). Only 500 GB returns trustworthy data ≤6h, and even 500 GB caps at 24h. Grail is fast regardless (≤4.6 s worst case) — time was never the problem; **truncation is.**

2. **The `genai_spans` bucket fixes the scan problem decisively.** Scoping a query with `| filter dt.system.bucket == "genai_spans"` prunes the scan to the small bucket: **1h page scans drop from ~66 GB to ~0.13 GB (~470×) and from ~700–2200 ms to ~50–300 ms.** Low scan limits stop truncating; results are complete within the bucket.

3. **But `genai_spans` is not yet complete.** The routing rule captures ~90 % of GenAI span *volume* but strands a large share of distinct entities in `bos_spans` — most importantly **`bos-proxy-core`, the central LLM proxy that carries the model calls, tokens and cost.** Scoped to `genai_spans` alone the **Models page sees 4–5 models instead of 12–15**, and cost is undercounted. Agents/Prompts are largely fine; Models/FinOps and Explorer are not.

4. **Recommended immediate app change:** scope every `fetch spans` to **both** buckets — `| filter in(dt.system.bucket, "genai_spans", "bos_spans")`. Measured on the Models query this returns the **complete 12-model list while scanning 0.29 GB in 74 ms** (vs 66 GB / 679 ms unscoped). **Recommended durable fix:** extend the OpenPipeline routing rule so the proxy's provider/model/token spans also land in `genai_spans`, then scope to that single bucket.

---

## Part 1 — Baseline: unscoped (shared `spans` stream)

### 1a. Data scanned per query (GB) — ~page-independent (every page does `fetch spans`)

| Scan limit | 1h | 2h | 6h | 24h |
|---|---|---|---|---|
| **2 GB** | 2.0 ⚠️cap | 2.0 ⚠️cap | 2.0 ⚠️cap | 2.0 ⚠️cap |
| **5 GB** | 5.0 ⚠️cap | 5.0 ⚠️cap | 5.0 ⚠️cap | 5.0 ⚠️cap |
| **500 GB** | ~66–70 | ~137–143 | ~403–423 | 500 ⚠️cap |

⚠️ = scan limit hit → results may be truncated/incorrect. True volume grows ~66–70 GB/hour and hits the 500 GB ceiling around ~7–8 h.

### 1b. Query duration (ms) at 500 GB (correct data)

| Page | 1h | 2h | 6h | 24h |
|---|---|---|---|---|
| *Capability probe* | 1127 | 1762 | 3025 | 2654 |
| Pulse | 732 | 892 | 2081 | 2514 |
| Explorer | 964 | 914 | 1702 | 2147 |
| Agents | 2249 | 1391 | 3510 | **4614** |
| Models | 679 | 1082 | 1714 | 1794 |
| Prompts | 995 | 890 | 2892 | 2321 |
| Attribute Audit | 836 | 820 | 1977 | 1900 |

At **2 GB / 5 GB** durations are timeframe-invariant (scan stops at the cap): all pages fall in a ~470–1150 ms band. Fast — but see correctness below.

### 1c. Correctness under low scan limits (rows returned, 1h) — the number that matters

| Page | 2 GB | 5 GB | 500 GB (ground truth) |
|---|---|---|---|
| Agents | **0** ⚠️ | **0** ⚠️ | 8–14 agents |
| Prompts | **0** ⚠️ | 160 (partial) | 200 (full) |
| Explorer (services) | 3 ⚠️ | 4 ⚠️ | 7 |
| Models | 4 ⚠️ | 11 | 12 |

Agents returns **0 rows at 2 GB even at 24h** — a user on a low scan limit sees an empty Agents page no matter how far back they look.

---

## Part 2 — `genai_spans` bucket-scoped (`| filter dt.system.bucket == "genai_spans"`)

Bucket pruning works: `dt.system.bucket` is a partition key, so the filter restricts the scan to the bucket.

### 2a. Data scanned & duration, 500 GB limit (uncapped)

| Page | 1h data | 1h ms | 24h data | 24h ms | 24h rows |
|---|---|---|---|---|---|
| *Capability probe* | 3.17 GB | 298 | **52.96 GB** | 2132 | total 4.24 M |
| Pulse | 0.14 GB | 85 | 2.34 GB | 576 | agg |
| Explorer | 0.14 GB | 81 | 2.34 GB | 499 | 5 services |
| Agents | 0.20 GB | 270 | 4.50 GB | 2071 | 13 agents |
| Models | 0.12 GB | 48 | 2.33 GB | 201 | 5 models |
| Prompts | 0.13 GB | 57 | 2.33 GB | 405 | 200 (full) |
| Attribute Audit | 0.13 GB | 46 | 2.34 GB | 99 | 221 k section spans |

Note the **capability probe is the outlier at 24h (53 GB)**: its population filter reads `db.system` + `traceloop.span.kind` across all ~4.3 M bucket records, and those column groups are ~20× heavier per record than the token/model columns the page queries read. Still ~10× cheaper than unscoped, but it is the one query that does not get tiny. Consider narrowing the probe's population or caching it harder (it already uses `staleTime: 60s`).

### 2b. Effect of the scan-limit selector collapses

Because bucket-scoped volume is small (~0.13 GB/h for page queries), the scan limit rarely binds:
- **1h:** nothing caps (page queries ≤0.2 GB; probe 3.17 GB caps at 2 GB only).
- **24h:** page queries ~2.3 GB → **2 GB caps slightly, 5 GB and 500 GB identical (full data)**; Agents (4.5 GB) and the probe (53 GB) cap at both 2 and 5 GB.

Practically, **5 GB bucket-scoped returns complete data for every page up to ~24h** (except the probe and Agents at the 24h extreme), versus 5 GB unscoped which truncated everything even at 1h.

### 2c. Side-by-side, 1h (the headline improvement)

| Page | Unscoped 500 GB | `genai_spans` 500 GB | Data reduction | Speedup |
|---|---|---|---|---|
| Pulse | 66.4 GB / 732 ms | 0.14 GB / 85 ms | **474×** | 8.6× |
| Explorer | 66.3 GB / 964 ms | 0.14 GB / 81 ms | 474× | 12× |
| Agents | 66.4 GB / 2249 ms | 0.20 GB / 270 ms | 325× | 8.3× |
| Models | 66.3 GB / 679 ms | 0.12 GB / 48 ms | 534× | 14× |
| Prompts | 66.3 GB / 995 ms | 0.13 GB / 57 ms | 511× | 17× |
| Attribute Audit | 66.4 GB / 836 ms | 0.13 GB / 46 ms | 511× | 18× |
| *Capability probe* | 69.7 GB / 1127 ms | 3.17 GB / 298 ms | 22× | 3.8× |

---

## Part 3 — Completeness / routing-gap analysis (critical)

GenAI spans are split across two buckets. Clean, bucket-pruned counts (24h):

| | GenAI spans | Distinct models | Distinct agents | Distinct services |
|---|---|---|---|---|
| **Union (both buckets)** | 4,582,482 | **15** | **20** | **33** |
| `genai_spans` | 4,151,107 (90.6 %) | 4–5 | 10–13 | 11–14 |
| `bos_spans` | 431,375 (9.4 %) | 8 | 9 | 14 |

**The routing rule captures volume but misses entities.** `genai_spans` is dominated by one high-volume orchestration service (`bos-pp-anc-rt`, 3.9 M spans). The token/model-bearing **central proxy `bos-proxy-core` (216 k GenAI spans/24h) is in `bos_spans`, not `genai_spans`** — and it is the service that was the top token consumer in the baseline. Consequences of scoping to `genai_spans` alone:

- **Models / FinOps:** sees 4–5 models instead of 12–15 → cost and model-mix badly undercounted. **Broken.**
- **Explorer:** 5 services instead of 7 → incomplete catalog.
- **Agents / Prompts:** 13/14 agents, full prompt stream → largely correct (these live on the app services that *are* routed).

**Dual-bucket scope restores completeness cheaply.** The Models query scoped to `in(dt.system.bucket, "genai_spans", "bos_spans")` at 1h returned the **full 12-model list, scanning 0.29 GB in 74 ms** — complete like unscoped, ~230× less data.

---

## Part 4 — Recommendations

1. **App change now — scope every `fetch spans` to both buckets.** In `useScopedDql`/`injectScanLimit`, inject `| filter in(dt.system.bucket, "genai_spans", "bos_spans")` after each `fetch spans` (mirrors the existing scan-limit/sampling injection). Measured effect: correctness of the unscoped baseline at ~1–3 GB scans and sub-100 ms–2 s times. Makes the low-scan-limit truncation problem disappear.
2. **Durable fix — complete the routing rule.** Extend the OpenPipeline bucket-assignment rule so the proxy's provider/model/token spans (`bos-proxy-core`, and any service emitting `gen_ai.provider.name`/`gen_ai.request.model`/token usage) also route to `genai_spans`. Once ~100 % of GenAI spans land there, simplify the app to scope to the single `genai_spans` bucket.
3. **Verify routing completeness with a standing check.** `fetch spans, from:-24h | filter <AI_SPAN_POPULATION> | summarize c=count(), by:{dt.system.bucket}` should show ~0 in `bos_spans` once routing is complete. Today it is ~9 % by volume and ~40–70 % of distinct models/services.
4. **Trim the capability probe.** It is the one query that stays expensive even bucket-scoped (53 GB/24h) because of its `db.system`/`traceloop.span.kind` population filter. Narrow the population or lengthen its cache.
5. **Re-evaluate the scan-limit selector UX.** Once queries are bucket-scoped, low limits no longer truncate, so the selector can default lower (e.g. 5 GB) safely — or be de-emphasized. On the shared stream it was actively harmful (silent wrong data).

---

## Appendix — raw measurements

All values from Grail `metadata.grail`; data = `scannedBytes`/1e9 GB, time = `executionTimeMilliseconds`. "CAP" = `SCAN_LIMIT_GBYTES` notification present.

**Unscoped, 500 GB (GB / ms):**
Probe 1h 69.7/1127, 2h 142.9/1762, 6h 422.8/3025, 24h 500CAP/2654 · Pulse 66.4/732, 136.8/892, 403.4/2081, 500CAP/2514 · Explorer 66.3/964, 136.9/914, 403.4/1702, 500CAP/2147 · Agents 66.4/2249, 137.0/1391, 404.3/3510, 500CAP/4614 · Models 66.3/679, 136.7/1082, 403.3/1714, 500CAP/1794 · Prompts 66.3/995, 136.9/890, 403.5/2892, 500CAP/2321 · Attr-Audit 66.4/836, 136.8/820, 403.3/1977, 500CAP/1900.

**Unscoped, capped columns (all cap; 1h ms):** 2 GB — probe 771, pulse 710, explorer 535, agents 514, models 491, prompts 514, attr-audit 705. 5 GB — probe 527, pulse 485, explorer 522, agents 709, models 473, prompts 478, attr-audit 486. Timeframe-invariant (verified 24h: 2 GB probe 857 / agents 864; 5 GB probe 1142 / agents 860).

**`genai_spans`-scoped, 500 GB (GB / ms):** 1h — probe 3.17/298, pulse 0.140/85, explorer 0.140/81, agents 0.204/270, models 0.124/48, prompts 0.125/57, attr-audit 0.125/46. 24h — probe 52.96/2132, pulse 2.34/576, explorer 2.34/499, agents 4.50/2071, models 2.33/201, prompts 2.33/405, attr-audit 2.34/99.

**Bucket split (24h, bucket-pruned):** union 4,582,482 gen_ai spans / 15 models / 20 agents / 33 services; genai_spans 4,151,107 (90.6 %); bos_spans 431,375 (9.4 %). `bos-proxy-core` = 216 k gen_ai spans/24h, in `bos_spans` only. Dual-bucket Models 1h: 12 models, 0.29 GB, 74 ms.

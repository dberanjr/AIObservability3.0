# AWS Bedrock Logs + Metrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated **AWS Bedrock** page that reproduces the app's cost/usage/golden-signal analytics from Bedrock model-invocation **logs** + `cloud.aws.bedrock.*` **metrics**, and make the shared rate card **platform-aware** so cost is exact per hosting platform (Bedrock/Azure/GCP/Direct).

**Architecture:** A shared-layer change makes `data/pricing.ts` platform-aware (Milestone A). A pure Bedrock data layer (`ui/app/bedrock/`) provides model normalization, DQL builders, record parsers, and cost/ghost transforms (Milestone B), consumed by React hooks that route every query through the existing `useScopedDql` transport with the guardrails "ignore span-scoping" flags (Milestone C). The page composes existing primitives — `StatTile`, `DetailModalShell`, `StackedBar`, `Donut`, `BarList`, `Sparkline` — into 8 narrative zones (Milestone D).

**Tech Stack:** TypeScript, React, Dynatrace Strato components, `@dynatrace-sdk/react-hooks` (`useDql`), DQL over Grail, Vitest.

## Global Constraints

- **Test:** `npx vitest run <path>` for a single file; `npm test` runs all. Every logic task is TDD (failing test first).
- **Typecheck:** `npm run typecheck` (`tsc --noEmit -p ui/tsconfig.json`) must pass before every commit.
- **Lint:** `npm run lint` (eslint) must pass before every commit.
- **All cost math flows through `computeCost` / `costOf`** in `data/pricing.ts` — never price from raw token fields directly (existing app invariant).
- **All Bedrock DQL runs through `useScopedDql`** with `{ ignoreGlobalFilter: true, ignoreBucketFilter: true, ignoreSegments: true }` (these are metric/log queries with no `gen_ai.*` attributes; the span-only injectors must be bypassed) — exactly as `guardrails/useGuardrails.ts` does.
- **Log source filter is always `filter contains(dt.da.aws.log_group, "bedrock")` FIRST** (indexed field prunes scan before the `content` substring match).
- **Metric namespace is `cloud.aws.bedrock.*` (singular "cloud"), dimensioned `By: ModelId`.** Backtick-quote metric keys in DQL.
- **Backward compatibility:** every new `platform` parameter defaults to `"direct"`, so existing `costOf`/`computeCost`/`getPricing` call sites are unchanged.
- **Timeframe** comes from `useScope().scope.timeframe` (type `Timeframe` from `scope/types`, shape `{ from: string; to: string }`).
- **Commit** after each task with the message shown in its final step.

---

## File Structure

**Milestone A — shared pricing (modify existing):**
- Modify: `ui/app/data/pricing.ts` — platform types, registry, platform-aware lookups, ARN normalization.
- Modify: `ui/app/data/pricing.test.ts`, `ui/app/data/pricing.tenantModels.test.ts` — new cases.
- Create: `ui/app/data/pricing.platform.test.ts` — platform lookup + fallback tests.
- Modify: `ui/app/pricing/ModelPricingPanel.tsx` — platform selector + grouped display + composite-key save.

**Milestone B — Bedrock data layer (new dir `ui/app/bedrock/`):**
- Create: `ui/app/bedrock/types.ts` — `BedrockScope`, row/agg types.
- Create: `ui/app/bedrock/model.ts` (+ `.test.ts`) — `normalizeBedrockModelId`, `bedrockProviderOf`.
- Create: `ui/app/bedrock/queries.ts` (+ `.test.ts`) — log DQL builders.
- Create: `ui/app/bedrock/metricQueries.ts` (+ `.test.ts`) — metric `timeseries` builders.
- Create: `ui/app/bedrock/parse.ts` (+ `.test.ts`) — record parsers.
- Create: `ui/app/bedrock/cost.ts` (+ `.test.ts`) — daily-cost + ghost + summary transforms.

**Milestone C — hooks (in `ui/app/bedrock/`):**
- Create: `ui/app/bedrock/useBedrock.ts` (+ `.test.ts`) — `useBedrockAvailable`, `useBedrockOverview`, `useBedrockCost`, `useAgentSessions`, `useBedrockPerf`.

**Milestone D — page (new dir `ui/app/pages/Bedrock/`):**
- Create: `ui/app/pages/Bedrock/BedrockPage.tsx` and zone components (`BedrockHero.tsx`, `BedrockKpiRow.tsx`, `BedrockCostZone.tsx`, `BedrockCostChart.tsx`, `AgentSessionTable.tsx`, `BedrockPerfZone.tsx`, `BedrockFindings.tsx`, `BedrockTileModal.tsx`, `insights.ts` + `insights.test.ts`).
- Modify: `ui/app/App.tsx` — add `/bedrock` route.
- Modify: `ui/app/components/Header.tsx` — add the "Bedrock" nav item.

---

## Milestone A — Platform-aware pricing (shared layer)

### Task A1: Platform types, registry, and Bedrock-native entries

**Files:**
- Modify: `ui/app/data/pricing.ts`
- Create: `ui/app/data/pricing.platform.test.ts`

**Interfaces:**
- Produces: `type PricingPlatform = "direct" | "aws_bedrock" | "azure" | "gcp_vertex"`; `platformKey(platform, modelKey): string`; `PLATFORM_PRICING: Record<PricingPlatform, Record<string, ModelPricing>>`.

- [ ] **Step 1: Write the failing test**

Create `ui/app/data/pricing.platform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { platformKey, PLATFORM_PRICING } from "./pricing";

describe("platformKey", () => {
  it("returns the bare model key for direct (backward compatible)", () => {
    expect(platformKey("direct", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });
  it("namespaces non-direct platforms", () => {
    expect(platformKey("aws_bedrock", "nova-lite")).toBe("aws_bedrock::nova-lite");
  });
});

describe("PLATFORM_PRICING", () => {
  it("has a table for every platform", () => {
    expect(Object.keys(PLATFORM_PRICING).sort()).toEqual(
      ["aws_bedrock", "azure", "direct", "gcp_vertex"],
    );
  });
  it("prices Bedrock-only Amazon models (Titan/Nova)", () => {
    expect(PLATFORM_PRICING.aws_bedrock["titan-embed-text"]).toBeDefined();
    expect(PLATFORM_PRICING.aws_bedrock["nova-lite"]).toBeDefined();
    expect(PLATFORM_PRICING.aws_bedrock["nova-lite"].outputPerMTok).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run ui/app/data/pricing.platform.test.ts`
Expected: FAIL — `platformKey`/`PLATFORM_PRICING` not exported.

- [ ] **Step 3: Add the types + registry to `pricing.ts`**

Add near the top (after the `PRICING` table, before `normalizeModelKey`):

```ts
/** LLM hosting platform. Same model can be priced differently per platform. */
export type PricingPlatform = "direct" | "aws_bedrock" | "azure" | "gcp_vertex";

/** Composite override/registry key. `direct` stays bare for backward compat with
 *  every existing lookup and saved override; other platforms are namespaced. */
export const platformKey = (platform: PricingPlatform, modelKey: string): string =>
  platform === "direct" ? modelKey : `${platform}::${modelKey}`;

/** Bedrock-native models (Amazon Titan/Nova) — priced only on Bedrock. Claude on
 *  Bedrock is intentionally ABSENT here so it falls back to the Direct Claude
 *  rate (at parity today). Keys are normalizeModelKey() outputs. */
export const PRICING_BEDROCK: Record<string, ModelPricing> = {
  "titan-embed-text": {
    inputPerMTok: 0.02, outputPerMTok: 0, contextWindow: 8192,
    provider: "Amazon", tier: "low",
  },
  "nova-lite": {
    inputPerMTok: 0.06, outputPerMTok: 0.24, contextWindow: 300_000,
    provider: "Amazon", tier: "low",
  },
  "nova-2-lite": {
    inputPerMTok: 0.06, outputPerMTok: 0.24, contextWindow: 300_000,
    provider: "Amazon", tier: "low",
  },
  "nova-micro": {
    inputPerMTok: 0.035, outputPerMTok: 0.14, contextWindow: 128_000,
    provider: "Amazon", tier: "low",
  },
  "nova-pro": {
    inputPerMTok: 0.8, outputPerMTok: 3.2, contextWindow: 300_000,
    provider: "Amazon", tier: "mid",
  },
};

/** Per-platform built-in rate tables. `direct` is the existing PRICING table. */
export const PLATFORM_PRICING: Record<PricingPlatform, Record<string, ModelPricing>> = {
  direct: PRICING,
  aws_bedrock: PRICING_BEDROCK,
  azure: {},
  gcp_vertex: {},
};
```

> Note: verify the Titan/Nova rates against current AWS Bedrock pricing before customer rollout; they are list-price estimates and users can override them in the Model Pricing panel (Task A4).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run ui/app/data/pricing.platform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/data/pricing.ts ui/app/data/pricing.platform.test.ts
git commit -m "feat(pricing): platform dimension types + Bedrock-native rate table"
```

---

### Task A2: Platform-aware lookups with Direct fallback

**Files:**
- Modify: `ui/app/data/pricing.ts` (`resolveModelPricing`, `getPricing`, `computeCost`, `costOf`, `getEffectivePricing`)
- Modify: `ui/app/data/pricing.platform.test.ts`

**Interfaces:**
- Consumes: `platformKey`, `PLATFORM_PRICING`, `PRICING_OVERRIDES`, `normalizeModelKey`, `getBlendedPricing` (Task A1 + existing).
- Produces: `resolveModelPricing(model, platform?)`, `getPricing(model, platform?)`, `computeCost(tokens, model, platform?)`, `costOf(input, output, model, cache?, platform?)`, `getEffectivePricing(platform?)` — all default `platform = "direct"`.

- [ ] **Step 1: Write the failing test** — append to `pricing.platform.test.ts`:

```ts
import { resolveModelPricing, computeCost, costOf } from "./pricing";

describe("platform-aware lookup", () => {
  it("Claude on Bedrock falls back to the Direct Claude price (parity today)", () => {
    const direct = resolveModelPricing("claude-sonnet-4-6", "direct");
    const bedrock = resolveModelPricing("us.anthropic.claude-sonnet-4-6", "aws_bedrock");
    expect(bedrock.inputPerMTok).toBe(direct.inputPerMTok);
    expect(bedrock.outputPerMTok).toBe(direct.outputPerMTok);
    expect(bedrock.blended).toBeFalsy();
  });
  it("Amazon Nova is priced from the Bedrock table, not blended", () => {
    const p = resolveModelPricing("us.amazon.nova-2-lite-v1:0", "aws_bedrock");
    expect(p.blended).toBeFalsy();
    expect(p.outputPerMTok).toBeCloseTo(0.24);
  });
  it("computeCost accepts a platform and matches Direct for a Bedrock Claude call", () => {
    const tokens = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const b = computeCost(tokens, "us.anthropic.claude-sonnet-4-6", "aws_bedrock");
    expect(b.effectiveCost).toBeCloseTo(3); // $3 / 1M input for Sonnet
  });
  it("costOf default platform stays 'direct' (backward compatible)", () => {
    expect(costOf(1_000_000, 0, "claude-sonnet-4-6")).toBeCloseTo(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run ui/app/data/pricing.platform.test.ts`
Expected: FAIL — `resolveModelPricing` takes one arg / `computeCost` takes two.

- [ ] **Step 3: Thread `platform` through the resolvers** in `pricing.ts`:

Replace `resolveModelPricing`:

```ts
export const resolveModelPricing = (
  model: string | null | undefined,
  platform: PricingPlatform = "direct",
): ModelPricing => {
  if (model) {
    const key = normalizeModelKey(model);
    // 1. platform-specific override, then platform-specific built-in
    const platHit =
      PRICING_OVERRIDES.get(platformKey(platform, key)) ??
      PLATFORM_PRICING[platform]?.[key];
    if (platHit) return platHit;
    // 2. fall back to Direct (override then built-in) — Claude-on-Bedrock path
    if (platform !== "direct") {
      const directHit = PRICING_OVERRIDES.get(key) ?? PRICING[key];
      if (directHit) return directHit;
    }
  }
  return getBlendedPricing();
};
```

Replace `getPricing`:

```ts
export const getPricing = (
  model: string | undefined | null,
  platform: PricingPlatform = "direct",
): ModelPricing => {
  if (!model) return UNKNOWN_PRICE;
  const key = normalizeModelKey(model);
  return (
    PRICING_OVERRIDES.get(platformKey(platform, key)) ??
    PLATFORM_PRICING[platform]?.[key] ??
    (platform !== "direct"
      ? (PRICING_OVERRIDES.get(key) ?? PRICING[key])
      : undefined) ??
    UNKNOWN_PRICE
  );
};
```

Add `platform` to `computeCost` and `costOf`:

```ts
export const computeCost = (
  tokens: NormalizedTokens,
  model: string | null | undefined,
  platform: PricingPlatform = "direct",
): CostBreakdown => {
  const pricing = resolveModelPricing(model, platform);
  // …unchanged body…
};

export const costOf = (
  inputTokens: number,
  outputTokens: number,
  model: string | null | undefined,
  cache?: { read?: number; write?: number },
  platform: PricingPlatform = "direct",
): number =>
  computeCost(
    { inputTokens, outputTokens, cacheReadTokens: cache?.read ?? 0, cacheWriteTokens: cache?.write ?? 0 },
    model,
    platform,
  ).effectiveCost;
```

Add an optional `platform` arg to `getEffectivePricing`:

```ts
export const getEffectivePricing = (
  platform: PricingPlatform = "direct",
): Record<string, ModelPricing> => {
  const merged: Record<string, ModelPricing> = { ...(PLATFORM_PRICING[platform] ?? {}) };
  const prefix = platform === "direct" ? "" : `${platform}::`;
  for (const [key, val] of PRICING_OVERRIDES.entries()) {
    if (platform === "direct" && key.includes("::")) continue;
    if (platform !== "direct" && !key.startsWith(prefix)) continue;
    merged[key.slice(prefix.length)] = val;
  }
  return merged;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run ui/app/data/pricing.platform.test.ts ui/app/data/pricing.test.ts ui/app/data/costModel.test.ts`
Expected: PASS (existing tests still green — defaults preserve behavior).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add ui/app/data/pricing.ts ui/app/data/pricing.platform.test.ts
git commit -m "feat(pricing): platform-aware resolveModelPricing/getPricing/computeCost/costOf with Direct fallback"
```

---

### Task A3: ARN normalization + composite-key overrides

**Files:**
- Modify: `ui/app/data/pricing.ts` (`normalizeModelKey`, `setPricingOverrides`)
- Modify: `ui/app/data/pricing.test.ts`, `ui/app/data/pricing.tenantModels.test.ts`

**Interfaces:**
- Produces: `normalizeModelKey` strips inference-profile ARNs; `setPricingOverrides` accepts composite `platform::key` entries.

- [ ] **Step 1: Write the failing tests** — append to `pricing.test.ts`:

```ts
import { normalizeModelKey } from "./pricing";

describe("normalizeModelKey — Bedrock inference-profile ARNs", () => {
  it("strips the ARN path to the model id", () => {
    expect(
      normalizeModelKey(
        "arn:aws:bedrock:us-east-1:975049911737:inference-profile/us.anthropic.claude-sonnet-4-6",
      ),
    ).toBe("claude-sonnet-4-6");
  });
  it("keeps the dated Sonnet-4 family distinct from Sonnet-4-6", () => {
    expect(
      normalizeModelKey(
        "arn:aws:bedrock:us-east-1:637423486688:inference-profile/us.anthropic.claude-sonnet-4-20250514-v1:0",
      ),
    ).toBe("claude-sonnet-4");
  });
  it("normalizes the short Titan embed id", () => {
    expect(normalizeModelKey("amazon.titan-embed-text-v1")).toBe("titan-embed-text");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/data/pricing.test.ts`
Expected: FAIL — ARN not stripped (returns the full arn string).

- [ ] **Step 3: Add a `/`-path strip to `normalizeModelKey`** — immediately after `s = model.trim().toLowerCase();`:

```ts
  // Strip an ARN / inference-profile path, keeping only the trailing model id
  // (arn:aws:bedrock:…:inference-profile/us.anthropic.claude-… → us.anthropic.claude-…).
  // No canonical model key contains a "/", so this never removes real content.
  s = s.replace(/^.*\//, "");
```

- [ ] **Step 4: Composite-key overrides** — update `setPricingOverrides` so a `platform::rawKey` entry normalizes only the model part:

```ts
export const setPricingOverrides = (
  next: Record<string, ModelPricing> | null | undefined,
): void => {
  PRICING_OVERRIDES.clear();
  if (next) {
    for (const [rawKey, val] of Object.entries(next)) {
      const sep = rawKey.indexOf("::");
      const stored =
        sep === -1
          ? normalizeModelKey(rawKey)
          : `${rawKey.slice(0, sep)}::${normalizeModelKey(rawKey.slice(sep + 2))}`;
      PRICING_OVERRIDES.set(stored, val);
    }
  }
  for (const listener of PRICING_OVERRIDE_LISTENERS) listener();
};
```

- [ ] **Step 5: Run tests + tenant-model coverage**

Run: `npx vitest run ui/app/data/pricing.test.ts ui/app/data/pricing.tenantModels.test.ts ui/app/data/pricing.platform.test.ts`
Expected: PASS. (If `pricing.tenantModels.test.ts` asserts specific unpriced models, add the ARN forms above to its observed-models list.)

- [ ] **Step 6: Commit**

```bash
git add ui/app/data/pricing.ts ui/app/data/pricing.test.ts ui/app/data/pricing.tenantModels.test.ts
git commit -m "feat(pricing): normalize Bedrock inference-profile ARNs + composite-key overrides"
```

---

### Task A4: Platform selector in the Model Pricing panel

**Files:**
- Modify: `ui/app/pricing/ModelPricingPanel.tsx`

**Interfaces:**
- Consumes: `PricingPlatform`, `platformKey`, `useModelPricing().saveConfig` (existing).
- Produces: Add-Model form emits a composite `platform::key` when platform ≠ direct; rows group under a platform sub-heading.

- [ ] **Step 1: Add a platform selector to the Add-Model form.** In `AddModelFormProps`/`AddModelForm`, add state `const [platform, setPlatform] = useState<PricingPlatform>("direct");` and a `<select>` (Direct / AWS Bedrock / Azure / GCP Vertex) next to the provider field. On submit, compose the saved key:

```tsx
const savedKey = platformKey(platform, normalizeModelKey(key.trim()));
onAdd(savedKey, { inputPerMTok, outputPerMTok, contextWindow, provider: provider.trim(), tier, platform });
```

(Import `platformKey`, `normalizeModelKey`, and `type PricingPlatform` from `../data/pricing`. Add optional `platform?: PricingPlatform` to the panel's `Draft` interface.)

- [ ] **Step 2: Group rows by platform.** In `ModelPricingPanel`, before grouping by provider, split drafts by `d.platform ?? "direct"`; render a platform section heading ("Direct", "AWS Bedrock", …) above each provider group. The save loop in Step-existing already writes `overrides` keyed by the draft key — ensure Bedrock/Azure/GCP drafts keep their composite key when saving.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verify**

Run: `npm run build`. Open the Model Pricing panel; add a model under "AWS Bedrock", confirm it saves and that a Bedrock-scoped cost lookup picks it up (`resolveModelPricing(id, "aws_bedrock")`).

- [ ] **Step 5: Commit**

```bash
git add ui/app/pricing/ModelPricingPanel.tsx
git commit -m "feat(pricing): platform selector + grouped sections in the Model Pricing panel"
```

---

## Milestone B — Bedrock data layer (pure, unit-tested)

### Task B1: Bedrock model normalization + types

**Files:**
- Create: `ui/app/bedrock/types.ts`
- Create: `ui/app/bedrock/model.ts`, `ui/app/bedrock/model.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `interface BedrockScope { timeframe: Timeframe; accounts: string[]; models: string[] }`
  - `model.ts`: `normalizeBedrockModelId(modelId: string): string` (→ rate-card key), `bedrockProviderOf(modelId: string): string`, `shortModelName(modelId: string): string`.

- [ ] **Step 1: Write the failing test** — `ui/app/bedrock/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeBedrockModelId, bedrockProviderOf, shortModelName } from "./model";

describe("normalizeBedrockModelId", () => {
  it("maps both short and ARN forms to one rate-card key", () => {
    expect(normalizeBedrockModelId("us.anthropic.claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(
      normalizeBedrockModelId(
        "arn:aws:bedrock:us-east-1:516035591078:inference-profile/us.anthropic.claude-sonnet-4-6",
      ),
    ).toBe("claude-sonnet-4-6");
  });
});
describe("bedrockProviderOf", () => {
  it("reads the provider from the modelId prefix", () => {
    expect(bedrockProviderOf("us.anthropic.claude-opus-4-8")).toBe("Anthropic");
    expect(bedrockProviderOf("amazon.titan-embed-text-v1")).toBe("Amazon");
    expect(bedrockProviderOf("us.amazon.nova-2-lite-v1:0")).toBe("Amazon");
  });
});
describe("shortModelName", () => {
  it("drops region/vendor prefixes and the ARN path for display", () => {
    expect(shortModelName("us.anthropic.claude-opus-4-8")).toBe("claude-opus-4-8");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/bedrock/model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `types.ts` and `model.ts`**

`ui/app/bedrock/types.ts`:

```ts
import type { Timeframe } from "../scope/types";

export interface BedrockScope {
  timeframe: Timeframe;
  /** Selected AWS account ids; empty = all. */
  accounts: string[];
  /** Selected normalized model keys; empty = all. */
  models: string[];
}
```

`ui/app/bedrock/model.ts`:

```ts
import { normalizeModelKey } from "../data/pricing";

/** Bedrock modelId → rate-card key. normalizeModelKey already strips ARNs,
 *  region prefixes (us./global.), vendor prefixes, versions and dates. */
export const normalizeBedrockModelId = (modelId: string): string =>
  normalizeModelKey(modelId);

const VENDOR_LABEL: Record<string, string> = {
  anthropic: "Anthropic", amazon: "Amazon", meta: "Meta",
  cohere: "Cohere", mistral: "Mistral", ai21: "AI21", deepseek: "DeepSeek",
};

/** Provider display name from the modelId (after stripping ARN path + region). */
export const bedrockProviderOf = (modelId: string): string => {
  const s = modelId.toLowerCase().replace(/^.*\//, "").replace(/^(us|eu|apac|ap|sa|global)\./, "");
  const vendor = s.split(".")[0];
  return VENDOR_LABEL[vendor] ?? "Other";
};

/** Human-ish short name for tables/legends (keeps the version, drops prefixes). */
export const shortModelName = (modelId: string): string =>
  modelId.replace(/^.*\//, "").replace(/^(us|eu|apac|ap|sa|global)\./, "").replace(/^[a-z0-9]+\./, "");
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run ui/app/bedrock/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/bedrock/types.ts ui/app/bedrock/model.ts ui/app/bedrock/model.test.ts
git commit -m "feat(bedrock): model normalization + provider/display helpers"
```

---

### Task B2: Log DQL builders

**Files:**
- Create: `ui/app/bedrock/queries.ts`, `ui/app/bedrock/queries.test.ts`

**Interfaces:**
- Consumes: `BedrockScope` (B1).
- Produces: `bedrockLogBase(scope): string`; `buildBedrockOverviewQuery(scope): string`; `buildBedrockDailyCostQuery(scope): string`; `buildAgentSessionsQuery(scope): string`; `buildAccountModelQuery(scope): string`.

- [ ] **Step 1: Write the failing test** — `ui/app/bedrock/queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bedrockLogBase, buildBedrockOverviewQuery, buildBedrockDailyCostQuery,
  buildAgentSessionsQuery,
} from "./queries";

const scope = { timeframe: { from: "now()-7d", to: "now()" }, accounts: [] as string[], models: [] as string[] };

describe("bedrockLogBase", () => {
  it("filters the bedrock log group BEFORE the content match (scan pruning)", () => {
    const q = bedrockLogBase(scope);
    const gi = q.indexOf('dt.da.aws.log_group');
    const ci = q.indexOf('ModelInvocationLog');
    expect(gi).toBeGreaterThan(-1);
    expect(gi).toBeLessThan(ci);
    expect(q).toContain('parse content, "JSON:b"');
  });
  it("injects an account filter when accounts are selected", () => {
    const q = bedrockLogBase({ ...scope, accounts: ["975049911737", "637423486688"] });
    expect(q).toContain('in(b[accountId], array("975049911737","637423486688"))');
  });
});

describe("buildBedrockOverviewQuery", () => {
  it("aggregates invocations, tokens, accounts, models, sessions", () => {
    const q = buildBedrockOverviewQuery(scope);
    expect(q).toContain("summarize");
    expect(q).toContain("count()");
    expect(q).toContain("toLong(b[input][inputTokenCount])");
    expect(q).toContain("countDistinct(b[accountId])");
  });
});

describe("buildBedrockDailyCostQuery", () => {
  it("makes a per-day, per-model token timeseries", () => {
    const q = buildBedrockDailyCostQuery(scope);
    expect(q).toContain("makeTimeseries");
    expect(q).toContain("interval: 1d");
    expect(q).toContain("by:");
  });
});

describe("buildAgentSessionsQuery", () => {
  it("groups by identity session name and account", () => {
    const q = buildAgentSessionsQuery(scope);
    expect(q).toContain("arrayLast(splitString(b[identity][arn]");
    expect(q).toContain("by:");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/bedrock/queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `queries.ts`**

```ts
import type { BedrockScope } from "./types";

const arr = (xs: string[]): string => xs.map((x) => `"${x}"`).join(",");
const tf = (s: BedrockScope): string => `from: ${s.timeframe.from}, to: ${s.timeframe.to}`;

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run ui/app/bedrock/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/bedrock/queries.ts ui/app/bedrock/queries.test.ts
git commit -m "feat(bedrock): model-invocation log DQL builders"
```

---

### Task B3: Metric `timeseries` builders

**Files:**
- Create: `ui/app/bedrock/metricQueries.ts`, `ui/app/bedrock/metricQueries.test.ts`

**Interfaces:**
- Consumes: `Timeframe` (scope/types).
- Produces: `buildBedrockPerfByModelQuery(tf): string` (latency/ttft/invocations/tokens by ModelId), `buildBedrockTpmQuery(tf): string`.

- [ ] **Step 1: Write the failing test** — `metricQueries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBedrockPerfByModelQuery, buildBedrockTpmQuery } from "./metricQueries";

const tf = { from: "now()-24h", to: "now()" };

describe("buildBedrockPerfByModelQuery", () => {
  it("timeseries over the bedrock metric keys, by ModelId", () => {
    const q = buildBedrockPerfByModelQuery(tf);
    expect(q).toContain("timeseries");
    expect(q).toContain("`cloud.aws.bedrock.InvocationLatency.By.ModelId`");
    expect(q).toContain("`cloud.aws.bedrock.TimeToFirstToken.By.ModelId`");
    expect(q).toContain("by: { ModelId }");
    expect(q).toContain("from: now()-24h");
  });
});
describe("buildBedrockTpmQuery", () => {
  it("queries EstimatedTPMQuotaUsage", () => {
    expect(buildBedrockTpmQuery(tf)).toContain("`cloud.aws.bedrock.EstimatedTPMQuotaUsage.By.ModelId`");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/bedrock/metricQueries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `metricQueries.ts`**

```ts
import type { Timeframe } from "../scope/types";

const K = (name: string) => `\`cloud.aws.bedrock.${name}.By.ModelId\``;

/** Per-model latency/TTFT/invocations/tokens. `rollup: avg` lets the percentile
 *  fall back to average where the ingested statistic has no percentile (see spec
 *  §3.2 caveat). */
export const buildBedrockPerfByModelQuery = (tf: Timeframe): string =>
  `timeseries {
    latencyMs = avg(${K("InvocationLatency")}),
    ttftMs = avg(${K("TimeToFirstToken")}),
    invocations = sum(${K("Invocations")}),
    inTok = sum(${K("InputTokenCount")}),
    outTok = sum(${K("OutputTokenCount")})
  }, from: ${tf.from}, to: ${tf.to}, by: { ModelId }`;

export const buildBedrockTpmQuery = (tf: Timeframe): string =>
  `timeseries tpm = avg(${K("EstimatedTPMQuotaUsage")}), from: ${tf.from}, to: ${tf.to}, by: { ModelId }`;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run ui/app/bedrock/metricQueries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/bedrock/metricQueries.ts ui/app/bedrock/metricQueries.test.ts
git commit -m "feat(bedrock): cloud.aws.bedrock.* metric timeseries builders"
```

---

### Task B4: Cost + cache-ghost transforms

**Files:**
- Create: `ui/app/bedrock/cost.ts`, `ui/app/bedrock/cost.test.ts`

**Interfaces:**
- Consumes: `computeCost`, `resolveModelPricing`, `cacheRates` semantics (via `computeCost`), `normalizeBedrockModelId` (B1). NOTE: pass `platform="aws_bedrock"` to every cost call.
- Produces:
  - `interface DailyModelTokens { modelId: string; inTok: number; outTok: number; cacheRead: number; cacheWrite: number }`
  - `bedrockCostOfTokens(t: DailyModelTokens): { cost: number; blended: boolean; noCacheCost: number }`
  - `bedrockCostSummary(rows: DailyModelTokens[]): BedrockCostSummary`
  - `interface BedrockCostSummary { total: number; priced: number; estimated: number; savedByCache: number; estimatedModels: string[] }`

- [ ] **Step 1: Write the failing test** — `cost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bedrockCostOfTokens, bedrockCostSummary } from "./cost";

// Sonnet-4-6 = $3/1M in, $15/1M out; cache-read defaults to 10% of input for non-OpenAI.
const sonnet = { modelId: "us.anthropic.claude-sonnet-4-6", inTok: 1_000_000, outTok: 0, cacheRead: 1_000_000, cacheWrite: 0 };

describe("bedrockCostOfTokens", () => {
  it("prices cache-read tokens at the discounted rate and reports the no-cache counterfactual", () => {
    const r = bedrockCostOfTokens(sonnet);
    // actual: 1M input @ $3 + 1M cacheRead @ $0.30 = 3 + 0.30 = $3.30
    expect(r.cost).toBeCloseTo(3.3);
    // no-cache: cacheRead billed at full input rate → 1M @ $3 = +$3 → $6 total
    expect(r.noCacheCost).toBeCloseTo(6);
    expect(r.blended).toBe(false);
  });
});

describe("bedrockCostSummary", () => {
  it("splits priced vs estimated and totals cache savings", () => {
    const rows = [
      sonnet,
      { modelId: "us.anthropic.claude-opus-4-6-v1", inTok: 1_000_000, outTok: 0, cacheRead: 0, cacheWrite: 0 }, // unpriced → blended/estimated
    ];
    const s = bedrockCostSummary(rows);
    expect(s.estimatedModels).toContain("claude-opus-4-6");
    expect(s.savedByCache).toBeCloseTo(2.7); // 6 - 3.3 from the sonnet row
    expect(s.total).toBeCloseTo(s.priced + s.estimated);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/bedrock/cost.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `cost.ts`**

```ts
import { computeCost } from "../data/pricing";
import { normalizeBedrockModelId } from "./model";

export interface DailyModelTokens {
  modelId: string;
  inTok: number;
  outTok: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface BedrockCostSummary {
  total: number;
  priced: number;
  estimated: number;
  savedByCache: number;
  estimatedModels: string[];
}

/** Actual cost (cache-aware) + the no-cache counterfactual (cache-read tokens
 *  re-priced at full input rate). The delta is the "ghost" savings. */
export const bedrockCostOfTokens = (
  t: DailyModelTokens,
): { cost: number; blended: boolean; noCacheCost: number } => {
  const actual = computeCost(
    { inputTokens: t.inTok, outputTokens: t.outTok, cacheReadTokens: t.cacheRead, cacheWriteTokens: t.cacheWrite },
    t.modelId,
    "aws_bedrock",
  );
  // Counterfactual: fold cacheRead back into full-price input, zero the cache tier.
  const noCache = computeCost(
    { inputTokens: t.inTok + t.cacheRead, outputTokens: t.outTok, cacheReadTokens: 0, cacheWriteTokens: t.cacheWrite },
    t.modelId,
    "aws_bedrock",
  );
  return { cost: actual.effectiveCost, blended: actual.blended, noCacheCost: noCache.effectiveCost };
};

export const bedrockCostSummary = (rows: DailyModelTokens[]): BedrockCostSummary => {
  let priced = 0, estimated = 0, savedByCache = 0;
  const estimatedModels = new Set<string>();
  for (const row of rows) {
    const { cost, blended, noCacheCost } = bedrockCostOfTokens(row);
    savedByCache += Math.max(0, noCacheCost - cost);
    if (blended) {
      estimated += cost;
      estimatedModels.add(normalizeBedrockModelId(row.modelId));
    } else {
      priced += cost;
    }
  }
  return { total: priced + estimated, priced, estimated, savedByCache, estimatedModels: [...estimatedModels] };
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run ui/app/bedrock/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/bedrock/cost.ts ui/app/bedrock/cost.test.ts
git commit -m "feat(bedrock): cache-aware cost + no-cache ghost + priced/estimated summary"
```

---

### Task B5: Record parsers

**Files:**
- Create: `ui/app/bedrock/parse.ts`, `ui/app/bedrock/parse.test.ts`

**Interfaces:**
- Consumes: `DailyModelTokens` (B4), `bedrockCostOfTokens`, `normalizeBedrockModelId`, `shortModelName`.
- Produces: `parseOverview(records)`, `parseAgentSessions(records)`, `parsePerfByModel(records)` returning typed rows for the hooks; plus `interface AgentSessionRow`, `interface PerfByModelRow`.

- [ ] **Step 1: Write the failing test** — `parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAgentSessions, parsePerfByModel } from "./parse";

describe("parseAgentSessions", () => {
  it("computes cost, cache% and error rate per session", () => {
    const rows = parseAgentSessions([
      { session: "apollo-agent-session", account: "975049911737",
        invocations: 100, inTok: 900_000, outTok: 100_000, cacheRead: 100_000, cacheWrite: 0,
        errors: 1, models: ["us.anthropic.claude-sonnet-4-6"] },
    ]);
    expect(rows[0].session).toBe("apollo-agent-session");
    expect(rows[0].estCost).toBeGreaterThan(0);
    expect(rows[0].errorRate).toBeCloseTo(0.01);
    expect(rows[0].cachePct).toBeCloseTo(10); // 100k / 1M input-side
  });
});

describe("parsePerfByModel", () => {
  it("reads latency arrays and derives a p95-ish scalar", () => {
    const rows = parsePerfByModel([
      { ModelId: "us.anthropic.claude-opus-4-8", latencyMs: [20000, 22506, 25000], ttftMs: [19964], invocations: [7] },
    ]);
    expect(rows[0].model).toBe("claude-opus-4-8");
    expect(rows[0].latencyMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/bedrock/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parse.ts`**

```ts
import { toNum } from "../data/format";
import { bedrockCostOfTokens } from "./cost";
import { normalizeBedrockModelId, shortModelName } from "./model";

const numArr = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => (x == null ? 0 : toNum(x))) : [];
const arrAvg = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const arrMax = (a: number[]): number => (a.length ? Math.max(...a) : 0);

export interface OverviewTotals {
  invocations: number; inTok: number; outTok: number;
  cacheRead: number; cacheWrite: number;
  accounts: number; models: number; sessions: number; errors: number;
}
export const parseOverview = (records: Record<string, unknown>[]): OverviewTotals => {
  const r = records[0] ?? {};
  return {
    invocations: toNum(r.invocations), inTok: toNum(r.inTok), outTok: toNum(r.outTok),
    cacheRead: toNum(r.cacheRead), cacheWrite: toNum(r.cacheWrite),
    accounts: toNum(r.accounts), models: toNum(r.models),
    sessions: toNum(r.sessions), errors: toNum(r.errors),
  };
};

export interface AgentSessionRow {
  session: string; account: string; models: string[];
  invocations: number; inTok: number; outTok: number;
  cachePct: number; estCost: number; blended: boolean; errorRate: number;
}
export const parseAgentSessions = (records: Record<string, unknown>[]): AgentSessionRow[] =>
  (records ?? []).map((r) => {
    const inTok = toNum(r.inTok), outTok = toNum(r.outTok);
    const cacheRead = toNum(r.cacheRead), cacheWrite = toNum(r.cacheWrite);
    const models = Array.isArray(r.models) ? (r.models as string[]) : [];
    const primary = models[0] ?? "";
    const { cost, blended } = bedrockCostOfTokens({ modelId: primary, inTok, outTok, cacheRead, cacheWrite });
    const inputSide = inTok + cacheRead;
    const invocations = toNum(r.invocations);
    return {
      session: String(r.session ?? ""), account: String(r.account ?? ""),
      models: models.map(shortModelName),
      invocations, inTok, outTok,
      cachePct: inputSide > 0 ? (cacheRead / inputSide) * 100 : 0,
      estCost: cost, blended,
      errorRate: invocations > 0 ? toNum(r.errors) / invocations : 0,
    };
  });

export interface PerfByModelRow {
  model: string; latencyMs: number; ttftMs: number; invocations: number;
}
export const parsePerfByModel = (records: Record<string, unknown>[]): PerfByModelRow[] =>
  (records ?? []).map((r) => ({
    model: normalizeBedrockModelId(String(r.ModelId ?? "")),
    latencyMs: arrMax(numArr(r.latencyMs)),
    ttftMs: arrAvg(numArr(r.ttftMs)),
    invocations: numArr(r.invocations).reduce((s, x) => s + x, 0),
  }));
```

> The `latencyMs` scalar uses `arrMax` as a conservative "worst window" stand-in for P95 until the ingested statistic is confirmed (spec §3.2). Swap to `arrayPercentile` in DQL if a percentile statistic exists.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run ui/app/bedrock/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/bedrock/parse.ts ui/app/bedrock/parse.test.ts
git commit -m "feat(bedrock): record parsers for overview, sessions, and per-model perf"
```

---

## Milestone C — Hooks

### Task C1: `useBedrockAvailable` + `useBedrockOverview`

**Files:**
- Create: `ui/app/bedrock/useBedrock.ts`, `ui/app/bedrock/useBedrock.test.ts`

**Interfaces:**
- Consumes: `useScopedDql`, `useScope`, builders (B2), parsers (B5).
- Produces: `useBedrockAvailable(): { available: boolean; isLoading: boolean }`; `useBedrockOverview(scope): { totals: OverviewTotals; isLoading: boolean }`.

- [ ] **Step 1: Write the failing test** — `useBedrock.test.ts` (mock the transport):

```ts
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../scope/useScopedDql", () => ({
  useScopedDql: (q: string) => ({
    data: { records: q.includes("summarize") ? [{ invocations: 934, accounts: 4, models: 12, sessions: 13 }] : [{ x: 1 }] },
    isLoading: false, error: undefined,
  }),
}));
vi.mock("../scope/ScopeContext", () => ({ useScope: () => ({ scope: { timeframe: { from: "now()-7d", to: "now()" } } }) }));

import { useBedrockOverview } from "./useBedrock";

describe("useBedrockOverview", () => {
  it("returns parsed totals", () => {
    const { result } = renderHook(() =>
      useBedrockOverview({ timeframe: { from: "now()-7d", to: "now()" }, accounts: [], models: [] }),
    );
    expect(result.current.totals.invocations).toBe(934);
    expect(result.current.totals.accounts).toBe(4);
  });
});
```

> If `@testing-library/react` is not already a dev dependency, confirm with `grep '"@testing-library/react"' package.json`; the app's existing hook tests reveal the harness — mirror it. If hooks are tested without RTL, test the parser+builder composition directly instead and keep the hook a thin wrapper.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/bedrock/useBedrock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the two hooks in `useBedrock.ts`**

```ts
import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "../scope/ScopeContext";
import type { BedrockScope } from "./types";
import { buildBedrockOverviewQuery } from "./queries";
import { parseOverview, type OverviewTotals } from "./parse";

const IGNORE = { ignoreGlobalFilter: true, ignoreBucketFilter: true, ignoreSegments: true, staleTime: 60_000 } as const;

/** Cheap existence probe: any bedrock log group in the last 24h. */
export const useBedrockAvailable = (): { available: boolean; isLoading: boolean } => {
  const q = `fetch logs, from: now()-24h\n| filter contains(dt.da.aws.log_group, "bedrock")\n| limit 1\n| fields timestamp`;
  const res = useScopedDql<ResultRecord>(q, IGNORE);
  return { available: (res.data?.records?.length ?? 0) > 0, isLoading: res.isLoading };
};

export const useBedrockOverview = (
  scope: BedrockScope,
): { totals: OverviewTotals; isLoading: boolean; error?: Error } => {
  const res = useScopedDql<ResultRecord>(buildBedrockOverviewQuery(scope), IGNORE);
  return useMemo(
    () => ({
      totals: parseOverview(res.data?.records ?? []),
      isLoading: res.isLoading,
      error: res.error ?? undefined,
    }),
    [res.data, res.isLoading, res.error],
  );
};

export { useScope }; // re-export for page convenience
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run ui/app/bedrock/useBedrock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/app/bedrock/useBedrock.ts ui/app/bedrock/useBedrock.test.ts
git commit -m "feat(bedrock): useBedrockAvailable + useBedrockOverview hooks"
```

---

### Task C2: `useBedrockCost`, `useAgentSessions`, `useBedrockPerf`

**Files:**
- Modify: `ui/app/bedrock/useBedrock.ts`, `ui/app/bedrock/useBedrock.test.ts`

**Interfaces:**
- Produces:
  - `useBedrockCost(scope): { daily: BedrockDailyCostPoint[]; summary: BedrockCostSummary; isLoading }` where `interface BedrockDailyCostPoint { day: string; byModel: Record<string, number>; actual: number; savedByCache: number }`.
  - `useAgentSessions(scope): { rows: AgentSessionRow[]; isLoading }`
  - `useBedrockPerf(scope): { rows: PerfByModelRow[]; tpmPeakPct: number; isLoading }`

- [ ] **Step 1: Write the failing test** — append to `useBedrock.test.ts` an `useAgentSessions` case that mocks a sessions record and asserts `rows[0].estCost > 0`. (Mirror the C1 mock; add `collectDistinct`/`by:` branch returning one session row.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/bedrock/useBedrock.test.ts`
Expected: FAIL — `useAgentSessions` not exported.

- [ ] **Step 3: Implement the three hooks** (append to `useBedrock.ts`). Use the daily-cost, sessions, and metric builders; parse; and fold the per-day, per-model token series into `BedrockDailyCostPoint[]` via `bedrockCostOfTokens`. Example for cost:

```ts
import { buildBedrockDailyCostQuery, buildAgentSessionsQuery } from "./queries";
import { buildBedrockPerfByModelQuery, buildBedrockTpmQuery } from "./metricQueries";
import { parseAgentSessions, parsePerfByModel, type AgentSessionRow, type PerfByModelRow } from "./parse";
import { bedrockCostOfTokens, bedrockCostSummary, type BedrockCostSummary, type DailyModelTokens } from "./cost";
import { toNum } from "../data/format";

export interface BedrockDailyCostPoint {
  day: string; byModel: Record<string, number>; actual: number; savedByCache: number;
}

export const useBedrockCost = (
  scope: BedrockScope,
): { daily: BedrockDailyCostPoint[]; summary: BedrockCostSummary; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildBedrockDailyCostQuery(scope), IGNORE);
  return useMemo(() => {
    // makeTimeseries returns one record per modelId with parallel arrays + a shared time axis.
    const recs = (res.data?.records ?? []) as Record<string, unknown>[];
    const axis = (recs[0]?.timeframe as { start?: string } | undefined); // time labels come from the result's interval; index by bucket i
    const buckets = Math.max(0, ...recs.map((r) => (Array.isArray(r.inTok) ? (r.inTok as unknown[]).length : 0)));
    const daily: BedrockDailyCostPoint[] = [];
    const flat: DailyModelTokens[] = [];
    for (let i = 0; i < buckets; i++) {
      const byModel: Record<string, number> = {};
      let actual = 0, saved = 0;
      for (const r of recs) {
        const t: DailyModelTokens = {
          modelId: String(r.modelId ?? ""),
          inTok: toNum((r.inTok as number[])?.[i]), outTok: toNum((r.outTok as number[])?.[i]),
          cacheRead: toNum((r.cacheRead as number[])?.[i]), cacheWrite: toNum((r.cacheWrite as number[])?.[i]),
        };
        const { cost, noCacheCost } = bedrockCostOfTokens(t);
        byModel[t.modelId] = (byModel[t.modelId] ?? 0) + cost;
        actual += cost; saved += Math.max(0, noCacheCost - cost);
        flat.push(t);
      }
      daily.push({ day: `d${i}`, byModel, actual, savedByCache: saved });
    }
    void axis;
    return { daily, summary: bedrockCostSummary(flat), isLoading: res.isLoading };
  }, [res.data, res.isLoading]);
};

export const useAgentSessions = (
  scope: BedrockScope,
): { rows: AgentSessionRow[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildAgentSessionsQuery(scope), IGNORE);
  return useMemo(
    () => ({ rows: parseAgentSessions((res.data?.records ?? []) as Record<string, unknown>[]), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useBedrockPerf = (
  scope: BedrockScope,
): { rows: PerfByModelRow[]; tpmPeakPct: number; isLoading: boolean } => {
  const perf = useScopedDql<ResultRecord>(buildBedrockPerfByModelQuery(scope.timeframe), IGNORE);
  const tpm = useScopedDql<ResultRecord>(buildBedrockTpmQuery(scope.timeframe), IGNORE);
  return useMemo(() => {
    const rows = parsePerfByModel((perf.data?.records ?? []) as Record<string, unknown>[]);
    const tpmVals = ((tpm.data?.records ?? []) as Record<string, unknown>[])
      .flatMap((r) => (Array.isArray(r.tpm) ? (r.tpm as number[]) : []))
      .map((x) => toNum(x));
    return { rows, tpmPeakPct: tpmVals.length ? Math.max(...tpmVals) : 0, isLoading: perf.isLoading || tpm.isLoading };
  }, [perf.data, perf.isLoading, tpm.data, tpm.isLoading]);
};
```

> Confirm the exact `makeTimeseries` record shape (time axis + per-series arrays) against a live `dtctl query` before finalizing the bucket-indexing; adjust `day` labels to real timestamps from the result's time axis field.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run ui/app/bedrock/useBedrock.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add ui/app/bedrock/useBedrock.ts ui/app/bedrock/useBedrock.test.ts
git commit -m "feat(bedrock): cost (with ghost), agent-session, and perf hooks"
```

---

## Milestone D — Page & zones

> UI tasks compose already-tested hooks + existing primitives. Each ends with `npm run typecheck && npm run lint`, plus `npm run build` and a manual browser check. Where a task has real logic (insight sentences, ghost chart geometry), that logic is extracted to a pure, unit-tested function.

### Task D1: Route, nav tab, page shell + gating

**Files:**
- Modify: `ui/app/App.tsx` (add route), `ui/app/components/Header.tsx` (add nav item)
- Create: `ui/app/pages/Bedrock/BedrockPage.tsx`

- [ ] **Step 1: Add the route.** In `App.tsx`, import `BedrockPage` and add inside `<Routes>` (after `/models`):

```tsx
import { BedrockPage } from "./pages/Bedrock/BedrockPage";
// …
<Route path="/bedrock" element={<BedrockPage />} />
```

- [ ] **Step 2: Add the nav tab.** In `Header.tsx`, add to the `analyze` group's `items` array:

```ts
{ to: "/bedrock", label: "AWS Bedrock" },
```

- [ ] **Step 3: Create the page shell with scope + gating.** `BedrockPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useScope } from "../../scope/ScopeContext";
import { DataGapNote } from "../../components/DataGapNote";
import { useBedrockAvailable, useBedrockOverview } from "../../bedrock/useBedrock";
import type { BedrockScope } from "../../bedrock/types";

export const BedrockPage = () => {
  const { scope: appScope } = useScope();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const scope: BedrockScope = useMemo(
    () => ({ timeframe: appScope.timeframe, accounts, models }),
    [appScope.timeframe, accounts, models],
  );

  const { available, isLoading: probing } = useBedrockAvailable();
  const overview = useBedrockOverview(scope);

  if (!probing && !available) {
    return (
      <div style={{ padding: 24 }}>
        <Heading level={1}>AWS Bedrock</Heading>
        <DataGapNote title="No AWS Bedrock telemetry found">
          This page reads AWS Bedrock model-invocation logs
          (<code>/aws/bedrock/model-invocations</code>) and{" "}
          <code>cloud.aws.bedrock.*</code> metrics. Neither was found in the current
          timeframe. Confirm the AWS→Dynatrace integration is delivering Bedrock logs and metrics.
        </DataGapNote>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <Flex justifyContent="space-between" alignItems="center">
        <Flex flexDirection="column" gap={2}>
          <Heading level={1}>AWS Bedrock</Heading>
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
            {overview.totals.invocations.toLocaleString()} invocations · {overview.totals.accounts} accounts ·{" "}
            {overview.totals.models} models · {overview.totals.sessions} sessions · source: Logs + Metrics
          </Text>
        </Flex>
        {/* Scope selectors (Account, Model) wired in a later step — setAccounts/setModels. */}
      </Flex>
      {/* Zones D2–D7 mount here, each receiving `scope`. */}
    </div>
  );
};
```

> `DataGapNote`'s exact props — confirm with a quick read of `components/DataGapNote.tsx`; if it takes `children` only (no `title`), fold the heading into the body.

- [ ] **Step 4: Typecheck, lint, build, verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. Load the app, click the new **AWS Bedrock** tab; on a tenant with Bedrock data the header shows real counts; otherwise the empty-state renders.

- [ ] **Step 5: Commit**

```bash
git add ui/app/App.tsx ui/app/components/Header.tsx ui/app/pages/Bedrock/BedrockPage.tsx
git commit -m "feat(bedrock): route, nav tab, page shell with availability gating"
```

---

### Task D2: Narrative hero + computed insights

**Files:**
- Create: `ui/app/pages/Bedrock/insights.ts`, `ui/app/pages/Bedrock/insights.test.ts`, `ui/app/pages/Bedrock/BedrockHero.tsx`
- Modify: `ui/app/pages/Bedrock/BedrockPage.tsx` (mount hero)

**Interfaces:**
- Consumes: `OverviewTotals`, `BedrockCostSummary`, `PerfByModelRow[]`, `AgentSessionRow[]`.
- Produces: `computeInsights(input): Insight[]` where `interface Insight { tone: "warn" | "info" | "good"; text: string }`.

- [ ] **Step 1: Write the failing test** — `insights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeInsights } from "./insights";

it("flags model cost concentration", () => {
  const insights = computeInsights({
    summary: { total: 100, priced: 100, estimated: 0, savedByCache: 20, estimatedModels: [] },
    costByModel: { "claude-opus-4-8": 48, "claude-sonnet-4-6": 31 },
    invocationsByModel: { "claude-opus-4-8": 7, "claude-sonnet-4-6": 49 },
    perf: [
      { model: "claude-opus-4-8", latencyMs: 22500, ttftMs: 20000, invocations: 7 },
      { model: "claude-sonnet-4-6", latencyMs: 5800, ttftMs: 4400, invocations: 49 },
    ],
  });
  expect(insights.some((i) => /concentration|% of spend/i.test(i.text))).toBe(true);
  expect(insights.some((i) => /slower|latency|p95/i.test(i.text))).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/pages/Bedrock/insights.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `insights.ts`** — a pure ranker that emits up to 3 sentences (cost concentration, latency outlier, cache savings), each guarded by a threshold. Return `Insight[]`. (Compute the top model's spend share, the slowest vs fastest model latency ratio, and `savedByCache/total`.)

- [ ] **Step 4: Implement `BedrockHero.tsx`** — a two-column row: left = cost hero (`summary.total` with `EstimatedBadge` when `summary.estimated > 0`, WoW + 30-day projection from a second timeframe query or a simple ×(30/days) projection, and a `Sparkline`); right = the `computeInsights` sentences as bulleted rows with a tone dot. Mount it in `BedrockPage`.

- [ ] **Step 5: Run insight test + typecheck + build + verify**

Run: `npx vitest run ui/app/pages/Bedrock/insights.test.ts && npm run typecheck && npm run build`
Expected: PASS; hero shows the cost figure + live insight sentences.

- [ ] **Step 6: Commit**

```bash
git add ui/app/pages/Bedrock/insights.ts ui/app/pages/Bedrock/insights.test.ts ui/app/pages/Bedrock/BedrockHero.tsx ui/app/pages/Bedrock/BedrockPage.tsx
git commit -m "feat(bedrock): narrative hero with computed insight sentences"
```

---

### Task D3: Golden-signal KPI row + tile drill-down modal

**Files:**
- Create: `ui/app/pages/Bedrock/BedrockKpiRow.tsx`, `ui/app/pages/Bedrock/BedrockTileModal.tsx`
- Modify: `ui/app/pages/Bedrock/BedrockPage.tsx`

- [ ] **Step 1: Build the KPI row** using `StatTile`. Each tile passes `info` (the What/How/caveat string), `onClick` (open modal), `window`, and a `media` `Sparkline`. Example tile:

```tsx
<StatTile
  label="Est cost"
  value={fmtUsd(summary.total)}
  info={"USD spend for Bedrock calls in scope. Cost = Σ(input×in-rate + output×out-rate + cache-read×cache-rate) per model, using the Models rate card (platform: AWS Bedrock). Unpriced models use a fallback rate, flagged 'est'."}
  headerRight={summary.estimated > 0 ? <EstimatedBadge /> : undefined}
  window="7d"
  onClick={() => setModal("cost")}
  media={<Sparkline values={dailyTotals} />}
/>
```

Include tiles: Invocations, Tokens, Est cost, P95 latency (info notes *metric-derived, per-model, can't split by user/session*), TTFT, Error rate (info notes *log errorCode only; ~0.6%; floor not full rate*), TPM headroom, Sessions.

- [ ] **Step 2: Build `BedrockTileModal.tsx`** using `DetailModalShell` + `Section`/`Stat`/`StatGrid`. `modal === "cost"` renders the cost breakdown (over-time area, by-model `BarList`, by-account `BarList`, by-session `BarList`, input/output/cache split) + a "how it's calculated" footer. Other tiles render their own breakdown (e.g. P95 modal = latency `BarList` by model).

- [ ] **Step 3: Wire modal state** in `BedrockPage` (`const [modal, setModal] = useState<null | "cost" | "latency" | …>(null)`), render `<BedrockTileModal kind={modal} onClose={() => setModal(null)} … />` when set.

- [ ] **Step 4: Typecheck, lint, build, verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. Each tile shows an ⓘ on hover (built into `StatTile.info`); clicking opens the full-screen breakdown; Esc/backdrop closes it.

- [ ] **Step 5: Commit**

```bash
git add ui/app/pages/Bedrock/BedrockKpiRow.tsx ui/app/pages/Bedrock/BedrockTileModal.tsx ui/app/pages/Bedrock/BedrockPage.tsx
git commit -m "feat(bedrock): golden-signal KPI row with info tooltips + drill-down modals"
```

---

### Task D4: Cost & Usage zone (ghost chart + breakdowns)

**Files:**
- Create: `ui/app/pages/Bedrock/BedrockCostChart.tsx`, `ui/app/pages/Bedrock/geometry.ts`, `ui/app/pages/Bedrock/geometry.test.ts`, `ui/app/pages/Bedrock/BedrockCostZone.tsx`
- Modify: `ui/app/pages/Bedrock/BedrockPage.tsx`

**Interfaces:**
- Consumes: `BedrockDailyCostPoint[]`.
- Produces: `toGhostBars(points, maxPx): GhostBar[]` where `interface GhostBar { day: string; segments: { key: string; px: number }[]; ghostPx: number }`.

- [ ] **Step 1: Write the failing test** — `geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toGhostBars } from "./geometry";

it("scales the tallest counterfactual (actual+ghost) to maxPx and stacks segments", () => {
  const bars = toGhostBars(
    [{ day: "Jul 5", byModel: { a: 80, b: 60 }, actual: 140, savedByCache: 60 }],
    200,
  );
  const total = bars[0].segments.reduce((s, x) => s + x.px, 0) + bars[0].ghostPx;
  expect(total).toBeCloseTo(200); // (140 actual + 60 ghost) is the max → full height
  expect(bars[0].ghostPx).toBeCloseTo((60 / 200) * 200);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run ui/app/pages/Bedrock/geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `geometry.ts`** — find the max of `(actual + savedByCache)` across points; scale each day's per-model segments and its `savedByCache` ghost to px against that max.

- [ ] **Step 4: Implement `BedrockCostChart.tsx`** — render each day as a column of stacked colored segments (per model) with the translucent hatched ghost on top (`repeating-linear-gradient`, dashed top border), a per-day hover tooltip (per-model $, actual total, `−$ saved by caching`), and a legend including "Saved by caching". Build `BedrockCostZone.tsx` = chart + `Donut`/`BarList` for cost-share-by-model and cost-by-account. Mount in `BedrockPage`.

- [ ] **Step 5: Run geometry test + typecheck + build + verify**

Run: `npx vitest run ui/app/pages/Bedrock/geometry.test.ts && npm run typecheck && npm run build`
Expected: PASS; the daily chart shows solid stacks with the ghost cap; hovering shows the savings line.

- [ ] **Step 6: Commit**

```bash
git add ui/app/pages/Bedrock/BedrockCostChart.tsx ui/app/pages/Bedrock/geometry.ts ui/app/pages/Bedrock/geometry.test.ts ui/app/pages/Bedrock/BedrockCostZone.tsx ui/app/pages/Bedrock/BedrockPage.tsx
git commit -m "feat(bedrock): cost & usage zone with cache-savings ghost chart"
```

---

### Task D5: Agent-session leaderboard (scrollable) + session detail

**Files:**
- Create: `ui/app/pages/Bedrock/AgentSessionTable.tsx`
- Modify: `ui/app/pages/Bedrock/BedrockPage.tsx`, `ui/app/pages/Bedrock/BedrockTileModal.tsx`

- [ ] **Step 1: Build `AgentSessionTable.tsx`** from `useAgentSessions(scope).rows`: columns session · account · models (chips) · invocations · tokens · cache% · est cost (`EstimatedBadge` when `row.blended`) · p95 (joined from `useBedrockPerf` by the row's primary model) · error rate. Wrap the tbody in a scroll container: `<div style={{ maxHeight: 360, overflowY: "auto" }}>` — the list scrolls internally, no row-count clipping. Sort by est cost desc; header cells are sortable.

- [ ] **Step 2: Row → session detail.** On row click, open a `DetailModalShell` (reuse `BedrockTileModal` with `kind: "session"` + the row) showing that session's models, token/cost split, and its cache%.

- [ ] **Step 3: Mount** the table in `BedrockPage` as zone 4.

- [ ] **Step 4: Typecheck, lint, build, verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. The leaderboard scrolls within its panel; clicking a row opens the session detail.

- [ ] **Step 5: Commit**

```bash
git add ui/app/pages/Bedrock/AgentSessionTable.tsx ui/app/pages/Bedrock/BedrockPage.tsx ui/app/pages/Bedrock/BedrockTileModal.tsx
git commit -m "feat(bedrock): scrollable agent-session leaderboard with detail drill-down"
```

---

### Task D6: Performance, guardrails, findings, and scope selectors

**Files:**
- Create: `ui/app/pages/Bedrock/BedrockPerfZone.tsx`, `ui/app/pages/Bedrock/BedrockFindings.tsx`, `ui/app/pages/Bedrock/ScopeSelectors.tsx`
- Modify: `ui/app/pages/Bedrock/BedrockPage.tsx`

- [ ] **Step 1: Perf zone** — `BedrockPerfZone.tsx`: `BarList` of P95 latency by model + TTFT by model from `useBedrockPerf(scope).rows`; a TPM headroom line (`AreaChart` or `Sparkline`) with the `tpmPeakPct`; and an errors line ("N errors / period · from log errorCode; no error metric in tenant").

- [ ] **Step 2: Guardrails zone** — reuse the existing `useGuardrails()` hook; render a compact summary (invocations, intervened %, text units) with a link to the full Guardrails view. (No new query — it already reads `bedrock_guardrails.*`.)

- [ ] **Step 3: Findings strip** — `BedrockFindings.tsx`: reuse `computeInsights` (D2) but render each as a `FindingCard`; add the honest **coverage-gap** card ("No prompt/response content or tool/agent topology in these logs — enable Bedrock input/output data logging to unlock Prompts & Agent-tool views").

- [ ] **Step 4: Scope selectors** — `ScopeSelectors.tsx`: Account multi-select (options from `useBedrockOverview`/a distinct-accounts query) and Model multi-select, wired to `setAccounts`/`setModels` in `BedrockPage`. Mount in the header row (D1 Step 3 placeholder).

- [ ] **Step 5: Typecheck, lint, build, full verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all PASS. Walk the whole page: scope changes re-query; every tile has ⓘ + drill-down; the ghost chart and leaderboard render; guardrails + findings show.

- [ ] **Step 6: Commit**

```bash
git add ui/app/pages/Bedrock/BedrockPerfZone.tsx ui/app/pages/Bedrock/BedrockFindings.tsx ui/app/pages/Bedrock/ScopeSelectors.tsx ui/app/pages/Bedrock/BedrockPage.tsx
git commit -m "feat(bedrock): performance, guardrails, findings zones + account/model scope selectors"
```

---

### Task D7: End-to-end validation against the live tenant

**Files:** none (validation only)

- [ ] **Step 1: Validate representative queries** with dtctl against `fifththird-preprod` before sign-off:

```bash
dtctl query --context fifththird-preprod -o json -f - <<'EOF'
<paste buildBedrockOverviewQuery output with from:-7d/to:now()>
EOF
```

Confirm the overview, daily-cost (check the `makeTimeseries` record/array shape used in C2), sessions, and perf queries return sane numbers matching the study (≈934 invocations, 4 accounts, Opus P95 ≫ Sonnet).

- [ ] **Step 2: Reconcile the `makeTimeseries` shape.** If the daily-cost array indexing in `useBedrockCost` (C2) doesn't match the real result, fix the parsing and its label/time axis, re-run `npx vitest run ui/app/bedrock/useBedrock.test.ts`.

- [ ] **Step 3: Deploy to a test environment and eyeball** (per project convention — set `environmentUrl`, `npm run deploy`, then revert). Verify: tab appears, empty-state on a non-Bedrock tenant, ghost chart reads correctly, tile modals + info tooltips work, leaderboard scrolls.

- [ ] **Step 4: Commit any reconciliation fixes**

```bash
git add -A
git commit -m "fix(bedrock): reconcile makeTimeseries parsing with live tenant results"
```

---

## Self-Review

**Spec coverage** (§ → task):
- §6.1 IA / nav / gating → D1. Own scope, bypass span filters → C1/C2 `IGNORE` flags, D6 selectors.
- §6.2 zones 0–7 → D1 (0), D2 (1), D3 (2), D4 (3), D5 (4), D6 (5,6,7).
- §6.3 platform-aware cost, normalization, priced/estimated, CTA → A1–A4, B1, B4; `EstimatedBadge` reused in D3/D5.
- §6.4 cache ghost → B4 (math) + D4 (geometry + chart).
- §6.5 ⓘ info + click-modal + tooltips + scroll → D3 (StatTile.info/onClick + DetailModalShell), D5 (scroll).
- §7 architecture (query builders, normalizer, cost, useScopedDql transport, detection/gating) → B1–B5, C1–C2.
- §8 TDD → every logic task has a failing-test-first cycle.
- §9 out-of-scope → surfaced as the D6 coverage-gap finding (not built).
- §10 recommendations → coverage-gap finding (input/output logging), estimated CTA (add pricing), perf zone note (no error/throttle metric).
- §11 decisions → platform pricing (A), ghost = vs full input price (B4), unpriced = fallback est (B4 + EstimatedBadge), nav tab (D1), guardrails on-page + link (D6).

**Placeholder scan:** none — every code step has real code; the two "confirm shape" notes (DataGapNote props, makeTimeseries axis) are explicit validation steps (D1, C2, D7), not vague TODOs.

**Type consistency:** `PricingPlatform` (A1) used in A2–A4/B4; `BedrockScope` (B1) consumed by all builders/hooks; `DailyModelTokens`/`BedrockCostSummary` (B4) used by B5/C2; `AgentSessionRow`/`PerfByModelRow` (B5) used by C2/D5/D6; `BedrockDailyCostPoint` (C2) used by D4 geometry; `Insight` (D2) reused in D6. `computeCost`/`costOf` platform arg default `"direct"` keeps every existing call site valid.

**Known follow-ups folded into the plan:** verify Titan/Nova list rates (A1 note); confirm latency percentile statistic (B3/B5 notes); reconcile `makeTimeseries` record shape against live data (C2 note + D7).

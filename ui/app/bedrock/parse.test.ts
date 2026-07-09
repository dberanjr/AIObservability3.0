import { describe, expect, it } from "vitest";
import {
  aggregatePerfSeries,
  parseAccountCost,
  parseAgentSessions,
  parseFacets,
  parseOverview,
  parsePerfByModel,
} from "./parse";

describe("parseOverview", () => {
  it("maps a summarize-style record to OverviewTotals", () => {
    const totals = parseOverview([
      {
        invocations: 934, inTok: 1_600_000, outTok: 500_000,
        cacheRead: 100_000, cacheWrite: 0,
        accounts: 4, models: 12, sessions: 13, errors: 6,
      },
    ]);
    expect(totals).toEqual({
      invocations: 934, inTok: 1_600_000, outTok: 500_000,
      cacheRead: 100_000, cacheWrite: 0,
      accounts: 4, models: 12, sessions: 13, errors: 6,
    });
  });

  it("returns zeros for an empty result set", () => {
    expect(parseOverview([])).toEqual({
      invocations: 0, inTok: 0, outTok: 0,
      cacheRead: 0, cacheWrite: 0,
      accounts: 0, models: 0, sessions: 0, errors: 0,
    });
  });
});

describe("parseAgentSessions", () => {
  it("computes cost, cache% and error rate for a single-model session", () => {
    // buildAgentSessionsQuery now groups by (session, account, modelId), so
    // even a single-model session arrives as one row carrying `modelId`
    // (not the old `models` collectDistinct array).
    const rows = parseAgentSessions([
      { session: "apollo-agent-session", account: "975049911737",
        invocations: 100, inTok: 900_000, outTok: 100_000, cacheRead: 100_000, cacheWrite: 0,
        errors: 1, modelId: "us.anthropic.claude-sonnet-4-6" },
    ]);
    expect(rows[0].session).toBe("apollo-agent-session");
    expect(rows[0].models).toEqual(["claude-sonnet-4-6"]);
    expect(rows[0].estCost).toBeGreaterThan(0);
    expect(rows[0].blended).toBe(false);
    expect(rows[0].errorRate).toBeCloseTo(0.01);
    expect(rows[0].cachePct).toBeCloseTo(10); // 100k / 1M input-side
  });

  it("prices a multi-model session per-row and rolls it back up to one session row", () => {
    // A real agent session can span more than one model (e.g. Opus for
    // planning + an unpriced/experimental model for tool calls). Each row
    // must be priced at ITS OWN modelId, not the session's first model.
    const pricedRow = {
      session: "multi-model-session", account: "975049911737",
      invocations: 60, inTok: 600_000, outTok: 60_000, cacheRead: 0, cacheWrite: 0,
      errors: 1, modelId: "us.anthropic.claude-sonnet-4-6",
    };
    const unpricedRow = {
      session: "multi-model-session", account: "975049911737",
      invocations: 40, inTok: 400_000, outTok: 40_000, cacheRead: 100_000, cacheWrite: 0,
      errors: 1, modelId: "us.anthropic.claude-unpriced-test-v1",
    };

    const rows = parseAgentSessions([pricedRow, unpricedRow]);
    const [pricedOnly] = parseAgentSessions([pricedRow]);

    expect(rows).toHaveLength(1);
    const row = rows[0];

    // estCost is the SUM of both rows priced independently — strictly more
    // than pricing the priced model's tokens alone would cost.
    expect(row.estCost).toBeGreaterThan(pricedOnly.estCost);

    // blended is true because ONE of the two model rows fell back to the
    // blended rate, even though the other was a real rate-card hit.
    expect(row.blended).toBe(true);

    // both models show up, short-named, in the merged row.
    expect(row.models).toEqual(
      expect.arrayContaining(["claude-sonnet-4-6", "claude-unpriced-test-v1"]),
    );
    expect(row.models).toHaveLength(2);

    // invocations/tokens/errors are summed across the session's model rows.
    expect(row.invocations).toBe(100);
    expect(row.inTok).toBe(1_000_000);
    expect(row.outTok).toBe(100_000);
    expect(row.errorRate).toBeCloseTo(2 / 100); // 2 errors / 100 invocations

    // cachePct from SUMMED cacheRead / (summed inTok + summed cacheRead).
    expect(row.cachePct).toBeCloseTo((100_000 / (1_000_000 + 100_000)) * 100);
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

describe("parseAccountCost", () => {
  it("sums cost per account across its (account, modelId) rows and sorts desc", () => {
    const rows = parseAccountCost([
      { account: "111", modelId: "us.anthropic.claude-sonnet-4-6", inTok: 1_000_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
      { account: "111", modelId: "amazon.titan-text-express-v1", inTok: 1_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
      { account: "222", modelId: "us.anthropic.claude-sonnet-4-6", inTok: 100_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
    expect(rows.map((r) => r.account)).toEqual(["111", "222"]);
    expect(rows[0].cost).toBeGreaterThan(rows[1].cost);
    // account "111" rolls up BOTH of its model rows (sonnet + titan), not just one.
    expect(rows[0].cost).toBeGreaterThan(3); // sonnet alone: 1M input tokens = $3
  });

  it("returns [] for an empty result set", () => {
    expect(parseAccountCost([])).toEqual([]);
  });

  it("flags an account blended when any of its rows used the fallback rate", () => {
    const rows = parseAccountCost([
      { account: "111", modelId: "totally-unpriced-model-xyz", inTok: 1_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
    expect(rows[0].blended).toBe(true);
  });
});

describe("parseFacets", () => {
  it("groups raw modelIds by shortModelName so 3 raw forms of the same friendly model collapse to 1 entry", () => {
    // Real-world case: one on-demand inference-profile id + two
    // account-specific ARN forms of the SAME model all render "claude-sonnet-4-6"
    // via shortModelName — the picker must offer ONE option for all three, plus
    // a separate group for the unrelated opus model.
    const facets = parseFacets([
      {
        accounts: ["975049911737", "637423486688", "975049911737"],
        models: [
          "us.anthropic.claude-sonnet-4-6",
          "arn:aws:bedrock:us-east-1:975049911737:inference-profile/us.anthropic.claude-sonnet-4-6",
          "arn:aws:bedrock:us-east-1:637423486688:inference-profile/us.anthropic.claude-sonnet-4-6",
          "us.anthropic.claude-opus-4-8",
        ],
      },
    ]);
    expect(facets.accounts).toEqual(["637423486688", "975049911737"]);
    expect(facets.modelGroups).toHaveLength(2);
    // sorted by label
    expect(facets.modelGroups.map((g) => g.label)).toEqual(["claude-opus-4-8", "claude-sonnet-4-6"]);

    const opus = facets.modelGroups.find((g) => g.label === "claude-opus-4-8");
    expect(opus?.ids).toEqual(["us.anthropic.claude-opus-4-8"]);

    const sonnet = facets.modelGroups.find((g) => g.label === "claude-sonnet-4-6");
    expect(sonnet?.ids).toEqual(
      [
        "arn:aws:bedrock:us-east-1:637423486688:inference-profile/us.anthropic.claude-sonnet-4-6",
        "arn:aws:bedrock:us-east-1:975049911737:inference-profile/us.anthropic.claude-sonnet-4-6",
        "us.anthropic.claude-sonnet-4-6",
      ].sort(),
    );
    expect(sonnet?.ids).toHaveLength(3);
  });

  it("returns empty lists for an empty result set", () => {
    expect(parseFacets([])).toEqual({ accounts: [], modelGroups: [] });
  });

  it("drops non-string / empty entries defensively", () => {
    const facets = parseFacets([{ accounts: ["111", null, ""], models: [42, "amazon.titan-text-express-v1"] }]);
    expect(facets.accounts).toEqual(["111"]);
    expect(facets.modelGroups).toEqual([{ label: "titan-text-express-v1", ids: ["amazon.titan-text-express-v1"] }]);
  });
});

describe("aggregatePerfSeries", () => {
  it("sums invocations/tokens, maxes latency/tpm, and averages ttft over non-zero records, with null→0", () => {
    const perfRecords = [
      {
        ModelId: "us.anthropic.claude-sonnet-4-6",
        invocations: [10, 20, 30],
        inTok: [100, 200, 300],
        outTok: [10, 20, 30],
        latencyMs: [500, 600, 700],
        ttftMs: [50, 0, 70],
      },
      {
        ModelId: "us.anthropic.claude-opus-4-8",
        invocations: [5, null, 15],
        inTok: [50, 60, 70],
        outTok: [5, 6, 7],
        latencyMs: [400, 900, 300],
        ttftMs: [0, 80, 90],
      },
    ];
    const tpmRecords = [
      { ModelId: "us.anthropic.claude-sonnet-4-6", tpm: [10, 20, 30] },
      { ModelId: "us.anthropic.claude-opus-4-8", tpm: [40, 10, 5] },
    ];

    const series = aggregatePerfSeries(perfRecords, tpmRecords);

    expect(series.invocations).toEqual([15, 20, 45]);
    expect(series.tokens).toEqual([165, 286, 407]);
    expect(series.latencyMs).toEqual([500, 900, 700]);
    expect(series.ttftMs).toEqual([50, 80, 80]);
    expect(series.tpm).toEqual([40, 20, 30]);
  });

  it("returns empty arrays for no records", () => {
    expect(aggregatePerfSeries([], [])).toEqual({
      invocations: [], tokens: [], latencyMs: [], ttftMs: [], tpm: [],
    });
  });
});

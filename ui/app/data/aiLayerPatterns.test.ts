import { describe, expect, it } from "vitest";
import {
  AI_LAYERS,
  layerRows,
  layerByKey,
  patternStatus,
  type LayerKey,
} from "./ai-layer-patterns";
import { USE_CASE_LENSES } from "../pages/Pulse/architectureLenses";

const ALL_KEYS: LayerKey[] = [
  "client",
  "gateway",
  "orchestrator",
  "agent",
  "tools",
  "llm",
  "vectordb",
  "memory",
];

describe("AI_LAYERS model", () => {
  it("defines all 8 architecture layers, uniquely", () => {
    const keys = AI_LAYERS.map((l) => l.key);
    expect(new Set(keys).size).toBe(8);
    for (const k of ALL_KEYS) expect(keys).toContain(k);
  });

  it("marks ONLY client and gateway as otelGap (no native OTel)", () => {
    for (const l of AI_LAYERS) {
      const expectGap = l.key === "client" || l.key === "gateway";
      expect(l.otelGap, `${l.key}`).toBe(expectGap);
    }
  });

  it("every layer has at least one problem pattern with a valid tier", () => {
    for (const l of AI_LAYERS) {
      expect(l.patterns.length).toBeGreaterThan(0);
      for (const p of l.patterns) {
        expect(["live", "enrichment", "card"]).toContain(p.tier);
        expect(p.title.length).toBeGreaterThan(0);
        expect(p.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("orders layerRows by ascending stackPosition", () => {
    const rows = layerRows();
    const positions = rows.map((r) => r[0].stackPosition);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // tools+llm share a row; vectordb+memory share a row.
    const flat = rows.flat().map((l) => l.key);
    expect(flat.length).toBe(8);
  });

  it("layerByKey resolves every key", () => {
    for (const k of ALL_KEYS) expect(layerByKey(k).key).toBe(k);
  });
});

describe("problem-pattern drill targets", () => {
  const allPatterns = AI_LAYERS.flatMap((l) => l.patterns);

  it("derives status from tier (detected | reference | needs-enrichment)", () => {
    expect(patternStatus("live")).toBe("detected");
    expect(patternStatus("card")).toBe("reference");
    expect(patternStatus("enrichment")).toBe("needs-enrichment");
  });

  it("every detected pattern has at least one drill", () => {
    for (const p of allPatterns) {
      if (patternStatus(p.tier) === "detected") {
        expect(p.drills.length, p.title).toBeGreaterThan(0);
      }
    }
  });

  it("reference / needs-enrichment patterns have no drills", () => {
    for (const p of allPatterns) {
      const s = patternStatus(p.tier);
      if (s === "reference" || s === "needs-enrichment") {
        expect(p.drills.length, p.title).toBe(0);
      }
    }
  });

  it("every drill has a valid tab and a non-empty focus + label", () => {
    for (const p of allPatterns) {
      for (const d of p.drills) {
        expect(["prompts", "agents"], `${p.title} → ${d.focus}`).toContain(d.tab);
        expect(d.focus.length, p.title).toBeGreaterThan(0);
        expect(d.label.length, p.title).toBeGreaterThan(0);
      }
    }
  });

  it("encodes the expected detected-pattern focus ids from the catalog", () => {
    const focusById = new Set(allPatterns.flatMap((p) => p.drills.map((d) => d.focus)));
    for (const id of [
      "llm-ctx-exhaustion",
      "llm-logical-errors",
      "llm-ttft-degradation",
      "llm-model-mismatch",
      "llm-rate-limit",
      "tool-retry-storm",
      "tool-token-spike",
      "agent-n1-tool-calls",
      "agent-degradation",
      "vdb-topk-over-retrieval",
      "mem-history-growth",
    ]) {
      expect(focusById, id).toContain(id);
    }
  });
});

describe("use-case lens config (drift guard)", () => {
  it("each lens references only layer keys that exist", () => {
    for (const lens of USE_CASE_LENSES) {
      for (const k of lens.layers) {
        expect(ALL_KEYS, `${lens.id} → ${k}`).toContain(k);
      }
    }
  });

  it("ships the three required lenses", () => {
    const ids = USE_CASE_LENSES.map((l) => l.id);
    expect(ids).toContain("cost");
    expect(ids).toContain("latency");
    expect(ids).toContain("loop");
  });
});

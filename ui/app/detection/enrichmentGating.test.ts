import { describe, expect, it } from "vitest";
import { CAPABILITIES, type CapabilityId } from "./attributeFields";
import { AI_LAYERS } from "../data/ai-layer-patterns";

/**
 * Enrichment-tier gating (brief K). The prompt-injection and
 * retrieval-hallucination surfaces are NOT detectable from raw GenAI telemetry;
 * they appear only when an enriching field is present (an OpenPipeline
 * security/PII rule, or an evaluator's gen_ai.evaluation.* score). These
 * assertions lock that intent at the data layer:
 *   - the gating capability exists and references the enriching field, and
 *   - the corresponding pattern is tier "enrichment" (so the UI gates it and
 *     shows the configuration-hint card when the field is absent, rather than
 *     fabricating the signal).
 */
const cap = (id: CapabilityId) => CAPABILITIES.find((c) => c.id === id);
const patterns = AI_LAYERS.flatMap((l) =>
  l.patterns.map((p) => ({ layer: l.key, ...p })),
);

describe("enrichment-tier gating", () => {
  it("prompt-injection gates on a security/PII enrichment field", () => {
    const c = cap("injectionEnrichment");
    expect(c).toBeDefined();
    expect(c!.predicate).toMatch(/pii_detected|injection|security/i);
  });

  it("retrieval-hallucination gates on evaluation scores", () => {
    const c = cap("evalScore");
    expect(c).toBeDefined();
    expect(c!.predicate).toMatch(/evaluation/i);
  });

  it("the prompt-injection pattern is tier 'enrichment' (never live/fabricated)", () => {
    const p = patterns.find((x) => /prompt injection/i.test(x.title));
    expect(p, "prompt injection pattern present").toBeDefined();
    expect(p!.tier).toBe("enrichment");
  });

  it("the retrieval-hallucination pattern is tier 'enrichment'", () => {
    const p = patterns.find((x) => /hallucination/i.test(x.title));
    expect(p, "hallucination pattern present").toBeDefined();
    expect(p!.tier).toBe("enrichment");
  });

  it("card-only patterns are NOT marked live (no detector built for them)", () => {
    const cardOnly = [
      /multimodal attachment/i,
      /embedding-model mismatch/i,
      /stale-ttl/i,
      /state write conflict/i,
      /parallel tool race/i,
      /metadata-filter/i,
    ];
    for (const re of cardOnly) {
      const p = patterns.find((x) => re.test(x.title));
      if (p) expect(p.tier, `${p.title}`).toBe("card");
    }
  });
});

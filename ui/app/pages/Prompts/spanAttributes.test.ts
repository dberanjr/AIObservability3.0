import { describe, expect, it } from "vitest";
import {
  humanizeAttrKey,
  inferAttrType,
  buildAiAttrSections,
  buildOtherAttrSection,
} from "./spanAttributes";

describe("humanizeAttrKey", () => {
  it("replaces dots/underscores with spaces and sentence-cases", () => {
    expect(humanizeAttrKey("gen_ai.prompt.0.role")).toBe("Gen ai prompt 0 role");
    expect(humanizeAttrKey("gen_ai.request.max_tokens")).toBe(
      "Gen ai request max tokens",
    );
    expect(humanizeAttrKey("llm.request.type")).toBe("Llm request type");
    expect(humanizeAttrKey("traceloop.association.properties.langgraph_path")).toBe(
      "Traceloop association properties langgraph path",
    );
  });
});

describe("inferAttrType", () => {
  it("maps JS runtime types to display types", () => {
    expect(inferAttrType(true)).toBe("bool");
    expect(inferAttrType(2000)).toBe("number");
    expect(inferAttrType("chat")).toBe("string");
    expect(inferAttrType(["a", "b"])).toBe("string");
  });
});

describe("buildAiAttrSections", () => {
  const attrs = {
    "gen_ai.request.model": "Claude-4.5-Opus",
    "gen_ai.request.max_tokens": 2000,
    "gen_ai.system": "openai",
    "llm.request.type": "chat",
    "traceloop.span.kind": "workflow",
    "traceloop.association.properties.langgraph_step": 23,
    // Dynatrace-derived — must NOT be swept into the generic gen_ai. group.
    "dt.smartscape.gen_ai.model": "GENAI_MODEL-abc",
    // non-AI noise stays out entirely.
    "k8s.namespace.name": "bos-proxy-core",
    "gen_ai.response.model": null, // empty dropped
  };

  it("groups keys by namespace in declared order, dropping empties", () => {
    const sections = buildAiAttrSections(attrs);
    expect(sections.map((s) => s.title)).toEqual([
      "Gen ai",
      "Llm",
      "Traceloop",
      "Gen ai (Dynatrace)",
    ]);
  });

  it("puts dt.smartscape.gen_ai.* in its own group, not Gen ai", () => {
    const sections = buildAiAttrSections(attrs);
    const genAi = sections.find((s) => s.title === "Gen ai")!;
    const dyn = sections.find((s) => s.title === "Gen ai (Dynatrace)")!;
    expect(genAi.rows.some((r) => r.label.includes("model"))).toBe(true);
    expect(genAi.rows.some((r) => r.value === "GENAI_MODEL-abc")).toBe(false);
    expect(dyn.rows).toHaveLength(1);
    expect(dyn.rows[0].value).toBe("GENAI_MODEL-abc");
  });

  it("humanizes labels and preserves types", () => {
    const genAi = buildAiAttrSections(attrs).find((s) => s.title === "Gen ai")!;
    const maxTok = genAi.rows.find((r) => r.label === "Gen ai request max tokens")!;
    expect(maxTok.value).toBe(2000);
    expect(maxTok.type).toBe("number");
  });

  it("returns [] when no AI attributes are present", () => {
    expect(buildAiAttrSections({ "k8s.namespace.name": "x" })).toEqual([]);
  });

  it("retains the raw dotted key on each row (for key-based search)", () => {
    const genAi = buildAiAttrSections(attrs).find((s) => s.title === "Gen ai")!;
    expect(genAi.rows.every((r) => typeof r.key === "string")).toBe(true);
    expect(genAi.rows.map((r) => r.key)).toContain("gen_ai.request.max_tokens");
  });
});

describe("buildOtherAttrSection", () => {
  const attrs = {
    "gen_ai.request.model": "m", // AI — excluded
    "k8s.namespace.name": "ns", // other
    "process.pid": 672, // other
    "span.name": "aws_bedrock.chat", // curated — excluded
  };

  it("collects non-AI, non-curated attributes only", () => {
    const other = buildOtherAttrSection(attrs, new Set(["span.name"]));
    expect(other).not.toBeNull();
    const labels = other!.rows.map((r) => r.label);
    expect(labels).toContain("K8s namespace name");
    expect(labels).toContain("Process pid");
    expect(labels).not.toContain("Span name");
    expect(other!.rows.some((r) => r.label.startsWith("Gen ai"))).toBe(false);
  });

  it("returns null when nothing remains", () => {
    expect(
      buildOtherAttrSection({ "gen_ai.request.model": "m" }, new Set()),
    ).toBeNull();
  });
});

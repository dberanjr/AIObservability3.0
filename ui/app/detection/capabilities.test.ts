import { describe, expect, it } from "vitest";
import {
  AI_SPAN_POPULATION,
  CAPABILITIES,
  VECTOR_DB_SYSTEMS,
  dbSystemIsVectorStore,
  type CapabilityId,
} from "./attributeFields";

const byId = (id: CapabilityId) => CAPABILITIES.find((c) => c.id === id);

describe("vectorDb capability — value allowlist, not db.system-any", () => {
  const vectorDb = byId("vectorDb");

  it("exists", () => {
    expect(vectorDb).toBeDefined();
  });

  it("does NOT light up on bare db.system presence (the old false-positive)", () => {
    // The bug was `isNotNull(\`db.system\`)`, which matches every relational DB.
    expect(vectorDb!.predicate).not.toContain("isNotNull(`db.system`)");
  });

  it("matches dedicated vector stores by value", () => {
    expect(vectorDb!.predicate).toContain("in(`db.system`,");
    expect(vectorDb!.predicate).toContain('"pinecone"');
  });

  it("still honours explicit vector_db.* attributes", () => {
    expect(vectorDb!.predicate).toContain("vector_db.query.top_k");
  });

  it("excludes ambiguous engines that are usually plain databases", () => {
    for (const ambiguous of ["mysql", "oracle", "postgresql", "mongodb"]) {
      expect(VECTOR_DB_SYSTEMS).not.toContain(ambiguous);
    }
    expect(VECTOR_DB_SYSTEMS).toContain("pinecone");
  });
});

describe("dbSystemIsVectorStore()", () => {
  it("emits a DQL in() over the allowlist", () => {
    const expr = dbSystemIsVectorStore();
    expect(expr.startsWith("in(`db.system`,")).toBe(true);
    for (const v of VECTOR_DB_SYSTEMS) expect(expr).toContain(`"${v}"`);
  });
});

describe("AI_SPAN_POPULATION", () => {
  it("does not include db.system-any (avoids relational-DB flood on big tenants)", () => {
    expect(AI_SPAN_POPULATION).not.toContain("isNotNull(`db.system`)");
  });
  it("still admits vector-store-only and agent-only spans", () => {
    expect(AI_SPAN_POPULATION).toContain("gen_ai.agent.name");
    expect(AI_SPAN_POPULATION).toContain("in(`db.system`,");
  });
});

describe("new redesign capabilities are registered", () => {
  it.each([
    "ttft",
    "evalScore",
    "sessionUser",
    "mcp",
    "injectionEnrichment",
    "memoryStore",
  ] as CapabilityId[])("%s exists with a non-empty predicate", (id) => {
    const cap = byId(id);
    expect(cap, `${id} missing`).toBeDefined();
    expect(cap!.predicate.length).toBeGreaterThan(0);
  });

  it("sessionUser requires BOTH session.id and gen_ai.user", () => {
    const p = byId("sessionUser")!.predicate;
    expect(p).toContain("session.id");
    expect(p).toContain("gen_ai.user");
    expect(p).toContain(" and ");
  });

  it("ttft covers all three TTFT spellings", () => {
    const p = byId("ttft")!.predicate;
    expect(p).toContain("gen_ai.usage.time_to_first_token");
    expect(p).toContain("gen_ai.response.ttft");
    expect(p).toContain("gen_ai.response.time_to_first_chunk");
  });
});

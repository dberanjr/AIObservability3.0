import { describe, expect, it } from "vitest";
import { SECTIONS, SECTION_BY_ID } from "./catalog";

describe("catalog — AI-spans-in-window exclusions", () => {
  it("keeps db.system OUT of the RAG section population (it rides on non-AI DB spans)", () => {
    const vectordb = SECTION_BY_ID.vectordb;
    expect(vectordb).toBeDefined();
    expect(vectordb.population).not.toContain("db.system");
    // The genuine RAG/vector predicates still define the population.
    expect(vectordb.population).toContain("vector_db.query.text");
    expect(vectordb.population).toContain("gen_ai.retrieval.query.text");
  });

  it("still measures db.system as a listed attribute in the RAG section", () => {
    const vectordb = SECTION_BY_ID.vectordb;
    expect(vectordb.attributes.some((a) => a.name === "db.system")).toBe(true);
  });

  it("flags the Infrastructure section out of the AI-spans estimate", () => {
    const infra = SECTION_BY_ID.infra;
    expect(infra).toBeDefined();
    expect(infra.number).toBe(10);
    expect(infra.excludeFromSpanEstimate).toBe(true);
  });

  it("excludes ONLY the Infrastructure section from the estimate", () => {
    const excluded = SECTIONS.filter((s) => s.excludeFromSpanEstimate);
    expect(excluded.map((s) => s.id)).toEqual(["infra"]);
  });
});

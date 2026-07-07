import { describe, expect, it } from "vitest";
import { isServerSorted, serverSortClause } from "./promptsSort";

describe("promptsSort — which columns lift server-side (Prompts-9)", () => {
  it("marks tokens + duration as server-sortable", () => {
    expect(isServerSorted("inTokens")).toBe(true);
    expect(isServerSorted("outTokens")).toBe(true);
    expect(isServerSorted("durationMs")).toBe(true);
  });

  it("keeps cost / temperature / timestamp sample-only", () => {
    expect(isServerSorted("inCost")).toBe(false);
    expect(isServerSorted("outCost")).toBe(false);
    expect(isServerSorted("temperature")).toBe(false);
    expect(isServerSorted("timestampMs")).toBe(false);
  });

  it("emits a `<field> <dir>` fragment for server-sortable columns", () => {
    expect(serverSortClause({ key: "inTokens", dir: "desc" })).toBe("in_tok desc");
    expect(serverSortClause({ key: "outTokens", dir: "asc" })).toBe("out_tok asc");
    expect(serverSortClause({ key: "durationMs", dir: "desc" })).toBe(
      "duration_ms desc",
    );
  });

  it("returns null for sample-only sorts (query stays unchanged → no refetch)", () => {
    expect(serverSortClause({ key: "inCost", dir: "desc" })).toBeNull();
    expect(serverSortClause({ key: "temperature", dir: "asc" })).toBeNull();
    expect(serverSortClause({ key: "timestampMs", dir: "desc" })).toBeNull();
    expect(serverSortClause(undefined)).toBeNull();
  });
});

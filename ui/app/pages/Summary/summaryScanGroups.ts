import type { TileScanOpts } from "../../scope/tileScan";

/**
 * Human titles for each Summary scan group (the <ScanScope> name). Used in the
 * "inherited from …" hint so the note names the tile a shared query belongs to.
 */
export const GROUP_TITLES: Record<string, string> = {
  posture: "Fleet posture",
  quality: "Quality & trust",
  finops: "Spend · FinOps",
  efficiency: "Efficiency & mix",
  latency: "Latency by tier",
  hidden: "Hidden · 200-OK",
  agents: "Top agents by cost",
  activity: "Activity · 24h",
  patterns: "Problem patterns",
  findings: "Top findings",
};

/**
 * Ownership priority for a query shared by several tiles (react-query runs it
 * once and serves the rest from cache). The earliest group in this list that
 * uses a query is credited as its owner; the others "inherit" it. Ordered so a
 * query's most natural home owns it — e.g. the Hidden tile owns the 200-OK
 * failure query that the hero and Quality tiles also read.
 */
export const GROUP_PRIORITY: string[] = [
  "hidden",
  "efficiency",
  "finops",
  "activity",
  "agents",
  "patterns",
  "latency",
  "quality",
  "findings",
  "posture",
];

const priorityOf = (g: string): number => {
  const i = GROUP_PRIORITY.indexOf(g);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};

/** Summary's curated scan-attribution config: named titles, hand-tuned
 *  ownership priority, and ungrouped page-root queries credited to the hero. */
export const SUMMARY_SCAN_OPTS: TileScanOpts = {
  titleOf: (g) => GROUP_TITLES[g] ?? g,
  priorityOf,
  ungroupedAs: "posture",
};

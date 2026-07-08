/**
 * Perceptual edge-thickness weighting for the node-map.
 *
 * A linear count/maxCount ratio collapses almost every edge to the floor when
 * one tier (usually the LLM) dwarfs the rest — so mid-volume edges render as
 * identical thin lines and the "edge = call volume" encoding conveys nothing.
 * Taking the √ of the ratio lifts smaller edges back into a visible range while
 * still keeping the busiest edge at full weight, so a 10×-smaller edge still
 * reads as clearly thinner rather than bottoming out.
 */
export const EDGE_FLOOR = 0.12;

/** √-scaled 0–1 weight for an edge carrying `count` of `maxCount` calls. */
export const perceptualEdgeWeight = (count: number, maxCount: number): number => {
  if (!(count > 0) || !(maxCount > 0)) return EDGE_FLOOR;
  const ratio = Math.min(1, count / maxCount);
  return Math.max(EDGE_FLOOR, Math.sqrt(ratio));
};

import type { SemanticStatus } from "../../theme/statusColor";
import type { StatTileEmphasis } from "../../components/StatTile";

/**
 * Severity classification for the Agents KPI tiles, extracted so the thresholds
 * are testable and drive BOTH the tile color (StatTile emphasis) and the
 * non-color status cue (glyph + word) — severity is never encoded by color
 * alone. Thresholds are kept identical to the previous inline ternaries.
 */

/**
 * "Slow agents" count tile: any agent over the slow P90 threshold is a warning,
 * none is neutral. There is no critical tier here — the runaway distinction is
 * surfaced per-agent in the table, not in this fleet count.
 */
export const slowTileStatus = (slowCount: number): SemanticStatus =>
  slowCount > 0 ? "warning" : "neutral";

/**
 * Fleet error-rate tile (percent): >5% critical, >1% warning, otherwise
 * neutral — mirroring the per-agent breakdown thresholds.
 */
export const errorTileStatus = (errorRatePct: number): SemanticStatus =>
  errorRatePct > 5 ? "critical" : errorRatePct > 1 ? "warning" : "neutral";

/** "Looping agents" count tile: any detected loop is a warning. */
export const loopingTileStatus = (loopingCount: number): SemanticStatus =>
  loopingCount > 0 ? "warning" : "neutral";

/** Map a semantic status to the shared StatTile emphasis (color) enum. */
export const statusToEmphasis = (s: SemanticStatus): StatTileEmphasis =>
  s === "critical"
    ? "red"
    : s === "warning"
      ? "amber"
      : s === "good"
        ? "green"
        : "default";

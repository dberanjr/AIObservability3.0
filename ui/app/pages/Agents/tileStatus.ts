import { statusFromThreshold } from "../../theme/statusColor";
import type { SemanticStatus, Sev } from "../../theme/statusColor";
import type { StatTileEmphasis, StatTileTone } from "../../components/StatTile";

/**
 * These fleet KPI tiles read as "quiet" (neutral, not a green "good") when
 * healthy, so map the shared threshold scale's `ideal` step to neutral while
 * `warning` / `critical` pass straight through.
 */
const sevToStatus = (sev: Sev): SemanticStatus =>
  sev === "critical" ? "critical" : sev === "warning" ? "warning" : "neutral";

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
  sevToStatus(statusFromThreshold(slowCount, { warn: 1, bad: Infinity }));

/**
 * Fleet error-rate tile (percent): >=5% critical, >=1% warning, otherwise
 * neutral — mirroring the per-agent breakdown thresholds, now routed through
 * the shared statusFromThreshold scale (so the boundary is inclusive).
 */
export const errorTileStatus = (errorRatePct: number): SemanticStatus =>
  sevToStatus(statusFromThreshold(errorRatePct, { warn: 1, bad: 5 }));

/** "Looping agents" count tile: any detected loop is a warning. */
export const loopingTileStatus = (loopingCount: number): SemanticStatus =>
  sevToStatus(statusFromThreshold(loopingCount, { warn: 1, bad: Infinity }));

/** "N+1 tool loops" (high tool frequency) count tile: any flagged agent is a
 *  warning. Same count-based shape as the looping tile. */
export const highFreqTileStatus = (flaggedCount: number): SemanticStatus =>
  sevToStatus(statusFromThreshold(flaggedCount, { warn: 1, bad: Infinity }));

/** Map a semantic status to the shared StatTile emphasis (color) enum. */
export const statusToEmphasis = (s: SemanticStatus): StatTileEmphasis =>
  s === "critical"
    ? "red"
    : s === "warning"
      ? "amber"
      : s === "good"
        ? "green"
        : "default";

/**
 * Map a semantic status to the shared StatTile tone. Preferred over
 * statusToEmphasis: the tone drives the value color via toneToColor
 * (var(--status-*)), keeping the tile hue on the semantic status ramp instead
 * of the decorative --amber/--red brand tokens (CONS-4).
 */
export const statusToTone = (s: SemanticStatus): StatTileTone =>
  s === "critical"
    ? "critical"
    : s === "warning"
      ? "warn"
      : s === "good"
        ? "good"
        : "neutral";

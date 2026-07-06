/**
 * Single source of truth for semantic status → color, so severity is encoded
 * consistently across the app and NEVER by color alone: every status also has a
 * non-color cue (glyph + word) to pair with the color for accessibility.
 */
export type SemanticStatus =
  | "good"
  | "info"
  | "warning"
  | "critical"
  | "neutral";

export const STATUS_COLOR: Record<SemanticStatus, string> = {
  good: "var(--green-2)",
  info: "var(--blue)",
  warning: "var(--amber)",
  critical: "var(--red)",
  neutral: "var(--text-3)",
};

export const statusColor = (s: SemanticStatus): string => STATUS_COLOR[s];

/** Non-color cue (glyph + label) to pair with the color for accessibility. */
export const STATUS_CUE: Record<
  SemanticStatus,
  { glyph: string; label: string }
> = {
  good: { glyph: "●", label: "Good" },
  info: { glyph: "ℹ", label: "Info" },
  warning: { glyph: "▲", label: "Warning" },
  critical: { glyph: "⬤", label: "Critical" },
  neutral: { glyph: "○", label: "—" },
};

/**
 * Classify a KPI delta into a status. `invert` marks metrics where a rise is
 * bad (spend, latency, error). A bad movement whose |percent| reaches
 * `severeAt` (default 50) is "critical", a milder bad move is "warning", a good
 * move is "good", and no movement is "neutral". Mirrors the Summary deltaTone.
 */
export const deltaStatus = (
  pct: number | null | undefined,
  opts?: { invert?: boolean; severeAt?: number },
): SemanticStatus => {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "neutral";
  const up = pct > 0;
  const good = opts?.invert ? !up : up;
  if (good) return "good";
  return Math.abs(pct) >= (opts?.severeAt ?? 50) ? "critical" : "warning";
};

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

/**
 * Severity → color. Routed through the semantic --status-* tokens (theme/tokens
 * defines them from Strato's Colors.Charts.Status) so this helper is the single
 * source of truth and severity never drifts from the chart status ramp. The
 * decorative --red/--amber/--green-2 brand tokens stay reserved for non-severity
 * use. Shape/return TYPE is unchanged (still `var(--…)` strings).
 */
export const STATUS_COLOR: Record<SemanticStatus, string> = {
  good: "var(--status-ideal)",
  info: "var(--blue)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
  neutral: "var(--text-3)",
};

export const statusColor = (s: SemanticStatus): string => STATUS_COLOR[s];

/**
 * Non-color cue (glyph + word) to pair with the color for accessibility.
 * `label` is kept as an alias of `word` for existing call sites; an `ideal`
 * entry (mirror of `good`) lets the threshold-based `Sev` scale index it too.
 */
export const STATUS_CUE: Record<
  SemanticStatus | "ideal",
  { glyph: string; label: string; word: string }
> = {
  good: { glyph: "●", label: "Good", word: "Good" },
  ideal: { glyph: "●", label: "Ideal", word: "Ideal" },
  info: { glyph: "ℹ", label: "Info", word: "Info" },
  warning: { glyph: "▲", label: "Warning", word: "Warning" },
  critical: { glyph: "⬤", label: "Critical", word: "Critical" },
  neutral: { glyph: "○", label: "—", word: "—" },
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

/**
 * Tile / KPI tone vocabulary used by StatTile and the page tile forks. Maps to
 * the same --status-* token source as STATUS_COLOR so a tone and a
 * SemanticStatus always resolve to the same hue.
 */
export type Tone = "neutral" | "good" | "warn" | "bad" | "critical";

/**
 * Tone → CSS var. good→ideal, warn→warning, bad|critical→critical, neutral→
 * --text-2 (a legible muted default, distinct from STATUS_COLOR.neutral which
 * uses the lighter --text-3 for pill dots).
 */
export const toneToColor = (tone: Tone): string => {
  switch (tone) {
    case "good":
      return "var(--status-ideal)";
    case "warn":
      return "var(--status-warning)";
    case "bad":
    case "critical":
      return "var(--status-critical)";
    case "neutral":
    default:
      return "var(--text-2)";
  }
};

/** Three-step severity scale for threshold-driven values. */
export type Sev = "ideal" | "warning" | "critical";

/**
 * Classify a numeric value against warn / bad thresholds into a `Sev`.
 *
 * Default (higher is worse, e.g. latency, error rate, spend): `value >= bad`
 * is critical, `value >= warn` is warning, otherwise ideal. Callers should pass
 * `warn <= bad`.
 *
 * `invert: true` (lower is worse, e.g. uptime %, cache-hit rate): `value <= bad`
 * is critical, `value <= warn` is warning, otherwise ideal. Callers should pass
 * `warn >= bad`.
 */
export const statusFromThreshold = (
  value: number,
  o: { warn: number; bad: number; invert?: boolean },
): Sev => {
  if (o.invert) {
    if (value <= o.bad) return "critical";
    if (value <= o.warn) return "warning";
    return "ideal";
  }
  if (value >= o.bad) return "critical";
  if (value >= o.warn) return "warning";
  return "ideal";
};

/**
 * AAA (AI Attribute Audit) — pure verdict + coverage-color helpers.
 *
 * Kept in a plain .ts module (no React) so the classification logic and the
 * coverage-ramp color math can be unit-tested directly. Consumed by
 * useAttributeAudit (verdict) and by the page / SectionCard (colors).
 */

/** Three-way presence verdict for a single audited attribute. */
export type Verdict = "present" | "sparse" | "missing";

/**
 * Share of the section population below which a *present* attribute is
 * downgraded to SPARSE — it was seen, but on so few spans (< 1%) that treating
 * it as fully covered would manufacture false confidence (a single span out of
 * millions still reads as raw-count > 0).
 */
export const SPARSE_SHARE_THRESHOLD = 0.01;

/**
 * Classify an attribute from its boolean presence and its share of the section
 * population (0..1). Missing → not seen at all; sparse → seen but below the
 * share threshold; present → seen on a meaningful fraction of spans.
 */
export const classifyVerdict = (present: boolean, share: number): Verdict => {
  if (!present) return "missing";
  if (share < SPARSE_SHARE_THRESHOLD) return "sparse";
  return "present";
};

/** Verdict → semantic (theme-safe) color token. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  present: "var(--green-2)",
  sparse: "var(--amber)",
  missing: "var(--red)",
};

/**
 * Graduated coverage color keyed to the covered ratio, so a section at 18/20
 * reads visibly greener than one at 2/20 (the old binary ramp painted both the
 * same flat amber). Snaps to red at exactly 0 and green at full; between, it
 * interpolates amber→green by the ratio.
 */
export const coverageRampColor = (present: number, total: number): string => {
  if (total <= 0) return "var(--text-3)";
  if (present <= 0) return "var(--red)";
  if (present >= total) return "var(--green-2)";
  const greenPct = Math.round((present / total) * 100);
  return `color-mix(in oklab, var(--green-2) ${greenPct}%, var(--amber))`;
};

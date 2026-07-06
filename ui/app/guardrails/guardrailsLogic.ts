/**
 * Pure logic for the AI Guardrails feature — no React, no DQL. Guardrail
 * telemetry currently comes from AWS Bedrock Guardrails metrics (see
 * ./providers), but everything here is provider-agnostic: it operates on
 * normalized GuardrailRow records so an Azure Content Safety / GCP Model Armor /
 * OpenInference-span provider can feed the same UI without changing this math.
 */

export interface GuardrailRow {
  /** Full resource ARN / id (provider-specific identity). */
  arn: string;
  /** Short, human-scannable id (last ARN segment). */
  guardrailId: string;
  region: string;
  account: string;
  invocations: number;
  intervened: number;
  /** Interventions ÷ invocations, as a percentage (0 when no invocations). */
  interventionRate: number;
  avgLatencyMs: number;
  textUnits: number;
}

export interface FleetGuardrails {
  /** Guardrails that reported any metric in the window. */
  guardrails: number;
  /** Guardrails that were actually invoked (invocations > 0). */
  activeGuardrails: number;
  invocations: number;
  intervened: number;
  /** Fleet interventions ÷ invocations, percentage. */
  interventionRate: number;
  /** Invocation-weighted average guardrail latency, ms. */
  avgLatencyMs: number;
  /** The guardrail with the most interventions (null when none intervened). */
  topIntervening: GuardrailRow | null;
}

/** Tone for an intervention rate. A guardrail intervening is GOOD (it is doing
 *  its job), but a very high rate signals an attack surge or a misconfiguration
 *  worth a look, a moderate rate is worth watching, and zero invocations is a
 *  quiet (idle) guardrail. This is deliberately NOT an error ramp. */
export type GuardrailTone = "quiet" | "clean" | "watch" | "high";

/** Extract the short guardrail id from an ARN (its last path segment). */
export const shortGuardrailId = (arn: string): string => {
  if (!arn) return "—";
  const seg = arn.split("/").pop();
  return seg && seg.length > 0 ? seg : arn;
};

/** Intervention rate as a percentage (0 when there were no invocations). */
export const interventionRate = (
  intervened: number,
  invocations: number,
): number => (invocations > 0 ? (intervened / invocations) * 100 : 0);

export const guardrailTone = (
  rate: number,
  invocations: number,
): GuardrailTone => {
  if (invocations <= 0) return "quiet";
  if (rate >= 50) return "high";
  if (rate >= 5) return "watch";
  return "clean";
};

/** Fleet-level rollup from the per-guardrail rows. */
export const aggregateFleet = (rows: GuardrailRow[]): FleetGuardrails => {
  const active = rows.filter((r) => r.invocations > 0);
  const invocations = rows.reduce((a, r) => a + r.invocations, 0);
  const intervened = rows.reduce((a, r) => a + r.intervened, 0);
  // Invocation-weighted latency so a 4-invocation guardrail can't swing the
  // fleet number the way an unweighted mean would.
  const latWeighted = active.reduce(
    (a, r) => a + r.avgLatencyMs * r.invocations,
    0,
  );
  const avgLatencyMs = invocations > 0 ? latWeighted / invocations : 0;
  const topIntervening =
    [...rows]
      .filter((r) => r.intervened > 0)
      .sort((a, b) => b.intervened - a.intervened)[0] ?? null;
  return {
    guardrails: rows.length,
    activeGuardrails: active.length,
    invocations,
    intervened,
    interventionRate: interventionRate(intervened, invocations),
    avgLatencyMs,
    topIntervening,
  };
};

/**
 * Per-bucket intervention-rate series for the trend chart. Element-wise
 * intervened/invocations; `null` where a bucket had no invocations (so the
 * chart draws a gap rather than a misleading 0%).
 */
export const perBucketRate = (
  inv: (number | null)[],
  intervened: (number | null)[],
): (number | null)[] =>
  inv.map((v, i) => {
    const n = v ?? 0;
    const k = intervened[i] ?? 0;
    return n > 0 ? (k / n) * 100 : null;
  });

/**
 * Canned Demo Mode dataset for AI Guardrails (ported from the standalone
 * AWSBedrockApp's guardrails section of `bedrock/demoData.ts`). Kept separate
 * from `bedrock/demoData.ts` because `useGuardrails` is shared with the
 * Prompts page's GuardrailsStrip, not Bedrock-only — this file has no
 * dependency on the Bedrock domain's model/account fixtures.
 */

import {
  shortGuardrailId,
  aggregateFleet,
  perBucketRate,
  type GuardrailRow,
  type FleetGuardrails,
} from "./guardrailsLogic";

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

const distribute = (total: number, weights: number[]): number[] => {
  const wsum = sum(weights);
  const raw = weights.map((w) => (total * w) / wsum);
  const floored = raw.map((x) => Math.round(x));
  const drift = total - sum(floored);
  const peakIdx = floored.indexOf(Math.max(...floored));
  floored[peakIdx] += drift;
  return floored;
};

const weightsOf = (shape: number[]): number[] => shape.map((v) => 1 + v);

/** Two independent 14-bucket variance shapes so invocations and interventions
 *  don't track each other in lockstep (a real intervention-rate trend moves
 *  independently of raw traffic volume). */
const FLEET_SHAPE = [-0.08, 0.10, -0.04, 0.14, -0.06, 0.03, -0.12, 0.09, 0.16, -0.02, 0.11, -0.09, 0.05, -0.10];
const SPIKE_SHAPE = [-0.15, 0.20, -0.10, 0.06, -0.05, 0.11, -0.08, 0.02, 0.18, -0.12, 0.04, -0.06, 0.09, -0.01];

const rawGuardrails = [
  {
    arn: "arn:aws:bedrock:us-east-1:111122223333:guardrail/gr-a1b2c3d4e5f6",
    region: "us-east-1",
    account: "111122223333",
    invocations: 8600,
    intervened: 145,
    avgLatencyMs: 42,
    textUnits: 210_000,
  },
  {
    // The flagged intervention example: a clearly-elevated ~7.4% rate.
    arn: "arn:aws:bedrock:us-east-1:444455556666:guardrail/gr-b7c8d9e0f1a2",
    region: "us-east-1",
    account: "444455556666",
    invocations: 4200,
    intervened: 310,
    avgLatencyMs: 55,
    textUnits: 98_000,
  },
  {
    // eslint-disable-next-line noSecrets/no-secrets -- fake demo guardrail ARN, not a real credential
    arn: "arn:aws:bedrock:eu-west-1:777788889999:guardrail/gr-c3d4e5f6a1b2",
    region: "eu-west-1",
    account: "777788889999",
    invocations: 1150,
    intervened: 6,
    avgLatencyMs: 38,
    textUnits: 26_000,
  },
];

export const DEMO_GUARDRAIL_ROWS: GuardrailRow[] = rawGuardrails.map((g) => ({
  arn: g.arn,
  guardrailId: shortGuardrailId(g.arn),
  region: g.region,
  account: g.account,
  invocations: g.invocations,
  intervened: g.intervened,
  interventionRate: (g.intervened / g.invocations) * 100,
  avgLatencyMs: g.avgLatencyMs,
  textUnits: g.textUnits,
}));

export const DEMO_GUARDRAIL_FLEET: FleetGuardrails = aggregateFleet(DEMO_GUARDRAIL_ROWS);

export const DEMO_GUARDRAIL_TREND_RATE: (number | null)[] = perBucketRate(
  distribute(DEMO_GUARDRAIL_FLEET.invocations, weightsOf(FLEET_SHAPE)),
  distribute(DEMO_GUARDRAIL_FLEET.intervened, weightsOf(SPIKE_SHAPE)),
);

import { describe, expect, it } from "vitest";
import {
  buildGuardrailSummaryQuery,
  buildGuardrailTrendQuery,
  AWS_GUARDRAIL_METRICS,
} from "./queries";

const tf = { from: "now()-24h", to: "now()" };

describe("buildGuardrailSummaryQuery", () => {
  it("aggregates the four Bedrock metrics per guardrail and derives the rate", () => {
    const q = buildGuardrailSummaryQuery(tf);
    expect(q).toContain(`sum(${AWS_GUARDRAIL_METRICS.invocations})`);
    expect(q).toContain(`sum(${AWS_GUARDRAIL_METRICS.intervened})`);
    expect(q).toContain(`avg(${AWS_GUARDRAIL_METRICS.latency})`);
    expect(q).toContain("by: {GuardrailArn, aws.region, aws.account.id}");
    expect(q).toContain("intervention_rate = if(total_inv > 0");
    expect(q).toContain("from: now()-24h, to: now()");
  });
});

describe("buildGuardrailTrendQuery", () => {
  it("sums invocations + interventions across the window", () => {
    const q = buildGuardrailTrendQuery(tf);
    expect(q).toContain(`sum(${AWS_GUARDRAIL_METRICS.invocations})`);
    expect(q).toContain(`sum(${AWS_GUARDRAIL_METRICS.intervened})`);
    expect(q).toContain("from: now()-24h, to: now()");
  });
});

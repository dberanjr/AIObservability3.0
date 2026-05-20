import type { SLAThresholds } from "./types";

export interface AgentHealthInput {
  p90Ms: number;
  p99Ms: number;
  errorRatePct: number;
  costPerInvocation: number;
}

export type AgentHealthStatus = "healthy" | "warning" | "breached";

export interface AgentHealthScore {
  score: number;
  status: AgentHealthStatus;
  breaches: string[];
}

/**
 * Pure function: agent metrics + thresholds → 0-100 health score with reasons.
 *
 * Penalties per Session 7 handoff:
 *   - 35 points for P90 breach
 *   - 25 points for P99 breach
 *   - 25 points for error-rate breach
 *   - 15 points for cost-per-invocation breach
 * Total possible deduction: 100. Score floored at 0.
 */
export const agentHealthScore = (
  agent: AgentHealthInput,
  thresholds: SLAThresholds,
): AgentHealthScore => {
  let score = 100;
  const breaches: string[] = [];

  if (thresholds.p90Ms != null && agent.p90Ms > thresholds.p90Ms) {
    score -= 35;
    breaches.push(
      `P90 ${agent.p90Ms.toFixed(0)}ms exceeds SLA ${thresholds.p90Ms}ms`,
    );
  }
  if (thresholds.p99Ms != null && agent.p99Ms > thresholds.p99Ms) {
    score -= 25;
    breaches.push(
      `P99 ${agent.p99Ms.toFixed(0)}ms exceeds SLA ${thresholds.p99Ms}ms`,
    );
  }
  if (
    thresholds.maxErrorRatePct != null &&
    agent.errorRatePct > thresholds.maxErrorRatePct
  ) {
    score -= 25;
    breaches.push(
      `Error rate ${agent.errorRatePct.toFixed(2)}% exceeds ${thresholds.maxErrorRatePct}%`,
    );
  }
  if (
    thresholds.maxCostPerInvocation != null &&
    agent.costPerInvocation > thresholds.maxCostPerInvocation
  ) {
    score -= 15;
    breaches.push(
      `Cost/invocation $${agent.costPerInvocation.toFixed(4)} exceeds $${thresholds.maxCostPerInvocation.toFixed(4)}`,
    );
  }

  const finalScore = Math.max(0, score);
  const status: AgentHealthStatus =
    breaches.length === 0 ? "healthy" : finalScore >= 60 ? "warning" : "breached";

  return { score: finalScore, status, breaches };
};

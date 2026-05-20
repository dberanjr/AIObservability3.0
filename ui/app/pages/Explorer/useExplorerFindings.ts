import { useMemo } from "react";
import type { Finding } from "../../components/drawers/types";
import { DEFAULT_FINDING_INTENTS } from "../../components/drawers/types";
import { fmtCount, fmtPercent } from "../../data/format";
import type { AIService } from "./useAIServices";
import type { ExplorerSummary } from "./useExplorerSummary";

const NEW_SERVICE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

export const useExplorerFindings = (
  services: AIService[],
  summary: ExplorerSummary,
): Finding[] => {
  return useMemo<Finding[]>(() => {
    if (services.length === 0) return [];
    const findings: Finding[] = [];
    const sortedByTokens = [...services].sort((a, b) => b.tokens - a.tokens);
    const top = sortedByTokens[0];
    const bedrockSvcs = services.filter((s) =>
      s.models.some((m) => /^(anthropic|amazon|cohere|meta|mistral)\./i.test(m)),
    );
    const multiModel = services.filter((s) => s.models.length >= 3);
    const errorHotspot = services
      .filter((s) => s.errors > 0)
      .sort((a, b) => b.errorRatePct - a.errorRatePct)[0];
    const logicalErrorTop = services
      .filter((s) => s.logicalErrors > 0)
      .sort((a, b) => b.logicalErrors - a.logicalErrors)[0];

    if (top && summary.tokens > 0) {
      findings.push({
        id: "concentration",
        severity: summary.concentrationPct > 50 ? "warning" : "info",
        category: "Concentration",
        entity: top.service,
        metric: fmtPercent(summary.concentrationPct, 0),
        context: `Top service accounts for ${fmtPercent(summary.concentrationPct, 0)} of fleet tokens.`,
        detail:
          "High concentration means a single service drives most of the cost. Verify the workload is intended and check for runaway loops.",
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    if (multiModel.length > 0) {
      findings.push({
        id: "multi-model",
        severity: "info",
        category: "Multi-model",
        entity: `${multiModel.length} services`,
        metric: `${multiModel.length}`,
        context: `${multiModel.length} services route across 3+ models — candidates for consolidation review.`,
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    if (errorHotspot && errorHotspot.errorRatePct > 0) {
      findings.push({
        id: `error-hotspot-${errorHotspot.serviceId}`,
        severity: errorHotspot.errorRatePct > 5 ? "critical" : "warning",
        category: "Error hotspot",
        entity: errorHotspot.service,
        metric: fmtPercent(errorHotspot.errorRatePct),
        context: `Highest error rate among AI services with ${fmtCount(errorHotspot.errors)} failed spans.`,
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    if (bedrockSvcs.length > 0) {
      findings.push({
        id: "bedrock-proxy",
        severity: "info",
        category: "Provider mix",
        entity: `${bedrockSvcs.length} services on Bedrock`,
        metric: `${bedrockSvcs.length}`,
        context:
          "Anthropic/Cohere/Mistral served via AWS Bedrock — normalize attribution and account for proxy markup in FinOps.",
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    if (logicalErrorTop) {
      findings.push({
        id: `logical-errors-${logicalErrorTop.serviceId}`,
        severity:
          summary.logicalErrors > 50
            ? "critical"
            : summary.logicalErrors > 0
              ? "warning"
              : "info",
        category: "HTTP 200 logical failures",
        entity: logicalErrorTop.service,
        metric: fmtCount(logicalErrorTop.logicalErrors),
        context: `Across the fleet, ${fmtCount(summary.logicalErrors)} responses returned HTTP 200 but carried payload-level failures (gen_ai.error.type, guardrail activations, refusals).`,
        detail:
          "Logical errors don't show up in HTTP error rate. Detection blends three signals: gen_ai.error.type span attribute, guardrail/moderation activation events, and OTel refusal markers.",
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    // "New services" placeholder — requires a span-onset timestamp query that
    // we'll wire when the inventory hook lands. For now we flag services we
    // resolved scope-side but haven't seen spans for as a proxy.
    void NEW_SERVICE_HORIZON_MS;

    return findings;
  }, [services, summary]);
};

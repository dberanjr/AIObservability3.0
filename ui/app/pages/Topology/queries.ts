import { dqlTimeArg, scopeFilterClause, globalFilterClauses, logicalErrorField, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Co-occurrence aggregate: each row groups by service × agent × tool × model
 * and reports the call count and error count. The client walks the rows to
 * derive nodes (per-tier distinct sets) and edges (service↔agent, agent↔tool,
 * agent↔model). Capped at 5000 unique combinations to keep the SVG render
 * tractable.
 */
export const buildTopologyQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter
    isNotNull(gen_ai.provider.name)
    or isNotNull(gen_ai.agent.name)
    or isNotNull(gen_ai.tool.name)
| fieldsAdd
    ${logicalErrorField("has_err")}
| summarize
    calls = count(),
    errors = sum(has_err),
    by: {
      service = entityName(dt.entity.service),
      agent = gen_ai.agent.name,
      tool = gen_ai.tool.name,
      model = gen_ai.request.model
    }
| sort calls desc
| limit 5000
`.trim();

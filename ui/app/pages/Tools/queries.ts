import { scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Per-tool aggregates. Reads gen_ai.tool.name as the canonical tool key.
 *
 *   - calling_agents: best-effort via collectDistinct on gen_ai.agent.name
 *     when the agent span shares the trace.
 *   - retry_attempts: reads gen_ai.tool.retry_count when present, else NULL.
 *   - mcp_server: gen_ai.tool.mcp.server (preferred) or mcp.server.name.
 */
export const buildToolsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.tool.name)
| fieldsAdd
    is_error = if(isNotNull(exception.type), 1, else: 0),
    retries = coalesce(toLong(gen_ai.tool.retry_count), 0),
    mcp_server = coalesce(gen_ai.tool.mcp.server, mcp.server.name)
| summarize
    calls = count(),
    avg_ns = avg(duration),
    p90_ns = percentile(duration, 90),
    p99_ns = percentile(duration, 99),
    errors = sum(is_error),
    retry_total = sum(retries),
    calling_agents = collectDistinct(gen_ai.agent.name),
    by: {
      tool = gen_ai.tool.name,
      service = entityName(dt.entity.service),
      mcp_server
    }
| fieldsAdd
    avg_ms = avg_ns / 1000000,
    p90_ms = p90_ns / 1000000,
    p99_ms = p99_ns / 1000000,
    error_rate_pct = if(calls > 0, toDouble(errors) / toDouble(calls) * 100, else: 0),
    retry_rate_pct = if(calls > 0, toDouble(retry_total) / toDouble(calls) * 100, else: 0)
| sort calls desc
| limit 500
`.trim();

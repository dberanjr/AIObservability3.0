import { dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../scope/queries";
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
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.tool.name)
| dedup {span.id}
| fieldsAdd
    is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0),
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
      service = service.name,
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

/**
 * "Discovered" tools mode. gen_ai.tool.name is ~absent in this tenant, so the
 * strict query returns almost nothing. Here a tool is an internal/client
 * function span (e.g. get_batch_pipeline_snapshot, execute_rds_select) that is
 * part of an agent execution but isn't itself an LLM call or the agent root.
 * Grouped by span.name + owning agent (which doubles as the service, dodging
 * the null-service entity duplication). Same record shape as buildToolsQuery
 * so the hook/table are mode-agnostic.
 */
export const buildDiscoveredToolsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| filter span.kind == "internal" or span.kind == "client"
| filter isNull(gen_ai.provider.name) and isNull(gen_ai.request.model)
| filter span.name != gen_ai.agent.name
| dedup {span.id}
| fieldsAdd
    is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0)
| summarize
    calls = count(),
    avg_ns = avg(duration),
    p90_ns = percentile(duration, 90),
    p99_ns = percentile(duration, 99),
    errors = sum(is_error),
    by: {
      tool = span.name,
      service = gen_ai.agent.name
    }
| fieldsAdd
    mcp_server = service,
    calling_agents = array(service),
    retry_total = 0,
    avg_ms = avg_ns / 1000000,
    p90_ms = p90_ns / 1000000,
    p99_ms = p99_ns / 1000000,
    error_rate_pct = if(calls > 0, toDouble(errors) / toDouble(calls) * 100, else: 0),
    retry_rate_pct = 0.0
| sort calls desc
| limit 500
`.trim();

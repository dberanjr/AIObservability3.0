import { dqlEscape, dqlTimeArg, scopeFilterClause, globalFilterClauses, logicalErrorField, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

// NOTE: this file once also held the standalone Tools tab's per-tool detail
// queries (timeseries / traces). The Tools tab folded into the Agents tab, so
// only the two aggregate builders below remain — reused by the Agents "Tools"
// sub-view (AgentToolsSubview) with an agent filter.

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
  /** When set, scope the tool table to a single agent (Agents-tab sub-view). */
  agentName?: string,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.tool.name)
${agentName ? `| filter gen_ai.agent.name == "${dqlEscape(agentName)}"` : ""}
| dedup {span.id}
| fieldsAdd
    ${logicalErrorField()},
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
/**
 * Per-tool time series (calls volume + p90 latency) for a single agent's tool,
 * powering the tool-drilldown chart in the Agents "Tools" sub-view. The tool
 * key is gen_ai.tool.name in strict mode, span.name in discovered mode — the
 * same keys the two aggregate builders group by. Global filters inject
 * centrally via useScopedDql.
 */
export const buildAgentToolDetailQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  agentName: string,
  toolName: string,
  intervalSec: number,
  strict: boolean,
): string => {
  const toolKey = strict ? "gen_ai.tool.name" : "span.name";
  const modeFilter = strict
    ? `| filter isNotNull(gen_ai.tool.name)`
    : `| filter span.kind == "internal" or span.kind == "client"
| filter isNull(gen_ai.provider.name) and isNull(gen_ai.request.model)`;
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| filter gen_ai.agent.name == "${dqlEscape(agentName)}"
${modeFilter}
| filter ${toolKey} == "${dqlEscape(toolName)}"
| makeTimeseries calls = count(), p90_ns = percentile(duration, 90), interval: ${intervalSec}s
`.trim();
};

export const buildDiscoveredToolsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
  /** When set, scope the tool table to a single agent (Agents-tab sub-view). */
  agentName?: string,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
${agentName ? `| filter gen_ai.agent.name == "${dqlEscape(agentName)}"` : ""}
| filter span.kind == "internal" or span.kind == "client"
| filter isNull(gen_ai.provider.name) and isNull(gen_ai.request.model)
| filter span.name != gen_ai.agent.name
| dedup {span.id}
| fieldsAdd
    ${logicalErrorField()}
| summarize
    calls = count(),
    avg_ns = avg(duration),
    p90_ns = percentile(duration, 90),
    p99_ns = percentile(duration, 99),
    errors = sum(is_error),
    // Real MCP server only (null in this tenant). Previously this was set to
    // the agent name, which made inferToolCategory bucket EVERY discovered
    // tool as "MCP" — categories are now derived from the tool name instead.
    mcp_server = takeFirst(coalesce(mcp.server.name, gen_ai.tool.mcp.server)),
    by: {
      tool = span.name,
      service = gen_ai.agent.name
    }
| fieldsAdd
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

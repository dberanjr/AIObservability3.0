import { dqlTimeArg } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Q1 — per-tool and MCP-server health. Powers the KPI strip, alert band, and
 * tool table. One row per tool (span.name) plus an aggregate row for the
 * mcp.server span. Tools are identified via traceloop.span.kind == "tool"
 * because this tenant does not emit the OTel MCP semantic conventions.
 *
 * Durations are divided by `1ms` (a duration unit), never a scalar, so round()
 * works on a number rather than silently returning a duration.
 *
 * samplingRatio and scanLimitGBytes are placeholders that useScopedDql rewrites
 * to the toolbar's active sampling and scan-limit selections.
 */
export const buildMcpHealthQuery = (timeframe: Timeframe): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
| filter span.name == "mcp.server" or traceloop.span.kind == "tool"
| fieldsAdd tool = if(span.name == "mcp.server", "mcp.server (aggregate)", else: span.name)
| summarize {
    calls = count(),
    errors = countIf(span.status_code == "error"),
    p50 = percentile(duration, 50),
    p95 = percentile(duration, 95),
    p99 = percentile(duration, 99),
    mx = max(duration)
  }, by: {tool}
| fieldsAdd error_rate_pct = round(errors * 100.0 / calls, decimals: 2)
| fieldsAdd p50_ms = round(p50 / 1ms, decimals: 1)
| fieldsAdd p95_ms = round(p95 / 1ms, decimals: 1)
| fieldsAdd p99_ms = round(p99 / 1ms, decimals: 1)
| fieldsAdd max_ms = round(mx / 1ms, decimals: 1)
| fieldsRemove p50, p95, p99, mx
| sort calls desc
`.trim();

/**
 * Q2 — hourly (interval-scaled) activity and error trend. Powers the chart.
 * Null buckets are treated as 0 client-side.
 */
export const buildMcpActivityQuery = (
  timeframe: Timeframe,
  intervalSec: number,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
| filter span.name == "mcp.server" or traceloop.span.kind == "tool"
| makeTimeseries {
    mcp_server_calls = countIf(span.name == "mcp.server"),
    tool_calls = countIf(traceloop.span.kind == "tool"),
    errors = countIf(span.status_code == "error")
  }, interval: ${intervalSec}s
`.trim();

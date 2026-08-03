/**
 * ONE scoped makeTimeseries that yields every per-bucket series the Pulse
 * charts need — per-tier throughput / p90 latency / error counts, plus the
 * finding-specific metrics (truncation, 429s, tokens, p95). Shared by:
 *   - the node-map sparklines + tier drawer (throughput / latency / errors),
 *   - the finding charts (so a finding shows WHEN its condition spiked).
 *
 * Validated to run as a single scan (conditional percentile + conditional sums
 * in one makeTimeseries). Routes through useScopedDql so it honours timeframe,
 * segments, sampling, the scan-limit selector, and the global filter. Pass
 * `enabled: false` to skip the scan (e.g. a finding drawer with nothing open).
 */
import { useMemo } from "react";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import { dqlTimeArg, LOGICAL_ERROR_EXPR } from "../../../scope/queries";
import { AI_SPAN_POPULATION } from "../../../detection/attributeFields";
import { toNum } from "../../../data/format";
import type { LayerKey } from "../../../data/ai-layer-patterns";
import { DEMO_PULSE_SERIES_REC } from "./demoData";

export interface PulseSeries {
  /** Per-tier span volume (throughput) per bucket. */
  throughput: Partial<Record<LayerKey, number[]>>;
  /** Per-tier p90 latency (ms) per bucket. */
  latencyMs: Partial<Record<LayerKey, number[]>>;
  /** Per-tier error count per bucket. */
  errors: Partial<Record<LayerKey, number[]>>;
  /** LLM truncation count per bucket. */
  truncation: number[];
  /** LLM 429 / rate-limit count per bucket. */
  rateLimit: number[];
  /** LLM tokens (input + output) per bucket (cost proxy). */
  tokens: number[];
  /** LLM input/prompt tokens per bucket. */
  inputTokens: number[];
  /** LLM output/completion tokens per bucket. */
  outputTokens: number[];
  /** Overall p95 latency (ms) per bucket. */
  p95Ms: number[];
  /** Bucket start labels (HH:MM) for hover readouts. */
  labels: string[];
  /** Human interval phrase for chart captions, e.g. "per hour" / "per 5 min". */
  intervalLabel: string;
  /** Bucket length in ms (for per-second throughput math). */
  intervalMs: number;
  isLoading: boolean;
}

export interface PulseSeriesRec {
  o_calls?: A;
  a_calls?: A;
  t_calls?: A;
  l_calls?: A;
  o_p90?: A;
  a_p90?: A;
  t_p90?: A;
  l_p90?: A;
  o_err?: A;
  a_err?: A;
  t_err?: A;
  l_err?: A;
  l_trunc?: A;
  l_429?: A;
  l_tok?: A;
  l_in?: A;
  l_out?: A;
  p95?: A;
  timeframe?: { start?: string; end?: string };
  interval?: string | number;
}
type Rec = PulseSeriesRec;
type A = Array<number | null>;

// Coerce to a finite number — percentile() returns null for empty buckets, and
// a single NaN poisons the whole sparkline path (min/max become NaN), so the
// line vanishes even though per-point hover still works.
const safe = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};
const arr = (a?: A): number[] => (Array.isArray(a) ? a.map(safe) : []);
const arrMs = (a?: A): number[] => arr(a).map((v) => v / 1_000_000);

const buildQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter ${AI_SPAN_POPULATION}
| fieldsAdd
    is_err = if(${LOGICAL_ERROR_EXPR}, 1, else: 0),
    is_trunc = if(contains(lower(toString(\`gen_ai.response.finish_reasons\`)), "max_tokens") or contains(lower(toString(\`gen_ai.response.finish_reasons\`)), "length"), 1, else: 0),
    o = if(isNotNull(\`traceloop.workflow.name\`) or isNotNull(\`traceloop.association.properties.langgraph_node\`), 1, else: 0),
    a = if(isNotNull(\`gen_ai.agent.name\`), 1, else: 0),
    t = if(\`traceloop.span.kind\` == "tool" or span.name == "mcp.server", 1, else: 0),
    l = if(isNotNull(\`gen_ai.request.model\`), 1, else: 0),
    in_tok = toLong(coalesce(\`gen_ai.usage.input_tokens\`, \`gen_ai.usage.prompt_tokens\`, 0)),
    out_tok = toLong(coalesce(\`gen_ai.usage.output_tokens\`, \`gen_ai.usage.completion_tokens\`, 0)),
    tok = toLong(coalesce(\`gen_ai.usage.input_tokens\`, \`gen_ai.usage.prompt_tokens\`, 0)) + toLong(coalesce(\`gen_ai.usage.output_tokens\`, \`gen_ai.usage.completion_tokens\`, 0))
| makeTimeseries {
    o_calls = sum(o), a_calls = sum(a), t_calls = sum(t), l_calls = sum(l),
    o_p90 = percentile(if(o == 1, duration, else: null), 90),
    a_p90 = percentile(if(a == 1, duration, else: null), 90),
    t_p90 = percentile(if(t == 1, duration, else: null), 90),
    l_p90 = percentile(if(l == 1, duration, else: null), 90),
    o_err = sum(if(o == 1 and is_err == 1, 1, else: 0)),
    a_err = sum(if(a == 1 and is_err == 1, 1, else: 0)),
    t_err = sum(if(t == 1 and is_err == 1, 1, else: 0)),
    l_err = sum(if(l == 1 and is_err == 1, 1, else: 0)),
    l_trunc = sum(if(l == 1 and is_trunc == 1, 1, else: 0)),
    l_429 = sum(if(toLong(coalesce(\`http.response.status_code\`, 0)) == 429, 1, else: 0)),
    l_tok = sum(if(l == 1, tok, else: 0)),
    l_in = sum(if(l == 1, in_tok, else: 0)),
    l_out = sum(if(l == 1, out_tok, else: 0)),
    p95 = percentile(duration, 95)
  }
`.trim();

/** Human "per <interval>" phrase from the makeTimeseries interval (in ns). */
const intervalLabelOf = (intervalNs?: string | number): string => {
  const ns = intervalNs != null ? Number(intervalNs) : NaN;
  if (!Number.isFinite(ns) || ns <= 0) return "";
  const ms = ns / 1_000_000;
  const min = ms / 60_000;
  if (min < 1) return `per ${Math.max(1, Math.round(ms / 1000))} sec`;
  if (min < 1.5) return "per minute";
  if (min < 60) return `per ${Math.round(min)} min`;
  const hr = min / 60;
  if (hr < 1.5) return "per hour";
  if (hr < 24) return `per ${Math.round(hr)} hours`;
  const d = hr / 24;
  return d < 1.5 ? "per day" : `per ${Math.round(d)} days`;
};

const buildLabels = (rec?: Rec, n = 0): string[] => {
  const startStr = rec?.timeframe?.start;
  const intervalNs = rec?.interval != null ? Number(rec.interval) : NaN;
  if (!startStr || !Number.isFinite(intervalNs) || n === 0) return [];
  const startMs = Date.parse(startStr);
  if (!Number.isFinite(startMs)) return [];
  const stepMs = intervalNs / 1_000_000;
  const fmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  return Array.from({ length: n }, (_, i) => fmt.format(new Date(startMs + i * stepMs)));
};

const EMPTY: PulseSeries = {
  throughput: {},
  latencyMs: {},
  errors: {},
  truncation: [],
  rateLimit: [],
  tokens: [],
  inputTokens: [],
  outputTokens: [],
  p95Ms: [],
  labels: [],
  intervalLabel: "",
  intervalMs: 0,
  isLoading: false,
};

/** Pure fold: a raw `Rec` summarize/makeTimeseries row -> the typed
 *  `PulseSeries` every chart consumes. Exported so the demo dataset can build
 *  a fixture row shaped exactly like the real query and run it through the
 *  SAME fold, instead of hand-typing per-series numbers. */
export const foldPulseSeries = (rec: Rec | undefined, isLoading: boolean): PulseSeries => {
  if (!rec) return { ...EMPTY, isLoading };
  const n = arr(rec.l_calls).length;
  return {
    throughput: {
      orchestrator: arr(rec.o_calls),
      agent: arr(rec.a_calls),
      tools: arr(rec.t_calls),
      llm: arr(rec.l_calls),
    },
    latencyMs: {
      orchestrator: arrMs(rec.o_p90),
      agent: arrMs(rec.a_p90),
      tools: arrMs(rec.t_p90),
      llm: arrMs(rec.l_p90),
    },
    errors: {
      orchestrator: arr(rec.o_err),
      agent: arr(rec.a_err),
      tools: arr(rec.t_err),
      llm: arr(rec.l_err),
    },
    truncation: arr(rec.l_trunc),
    rateLimit: arr(rec.l_429),
    tokens: arr(rec.l_tok),
    inputTokens: arr(rec.l_in),
    outputTokens: arr(rec.l_out),
    p95Ms: arrMs(rec.p95),
    labels: buildLabels(rec, n),
    intervalLabel: intervalLabelOf(rec.interval),
    intervalMs: Number.isFinite(Number(rec.interval)) ? Number(rec.interval) / 1_000_000 : 0,
    isLoading,
  };
};

/**
 * `showExample` is a separate trailing parameter (like `enabled`) rather than
 * part of a scope object, since this hook takes none — set by Pulse's
 * architecture map / token-efficiency tiles when Demo Mode (or the app-wide
 * "no AI telemetry yet" fallback) is active. `FindingDrawer`'s caller never
 * passes it, so it defaults to false there.
 */
export const usePulseSeries = (enabled = true, showExample = false): PulseSeries => {
  const { scope } = useScope();
  // Always build a valid query and gate execution with the `enabled` option —
  // passing "" to useDql triggers a DQL PARSE_ERROR ("end of query isn't
  // allowed here") rather than disabling the query.
  const { data, isLoading } = useScopedDql<Rec>(
    buildQuery(scope.timeframe.from, scope.timeframe.to ?? "now()"),
    { staleTime: 60_000, enabled: enabled && !showExample },
  );

  return useMemo<PulseSeries>(() => {
    if (showExample) return foldPulseSeries(DEMO_PULSE_SERIES_REC, false);
    return foldPulseSeries(data?.records?.[0], isLoading);
  }, [showExample, data, isLoading]);
};

/** Pick the metric series that best shows WHEN a finding's condition occurred. */
export const seriesForFinding = (
  finding: { type?: string; layer?: LayerKey },
  s: PulseSeries,
): number[] | undefined => {
  switch (finding.type) {
    case "truncation":
      return s.truncation;
    case "rate-limit":
      return s.rateLimit;
    case "cost-spike":
    case "token-surge":
      return s.tokens;
    case "latency-spike":
    case "ttft-degradation":
      return s.p95Ms;
    case "runaway-agent":
    case "within-trace-growth":
      return s.throughput.agent;
    case "model-mismatch":
      return s.throughput.llm;
    default:
      return finding.layer ? s.throughput[finding.layer] : undefined;
  }
};

/** A short caption describing what a finding's chart series measures (no period
 * — the interval phrase is appended by the caller). */
export const seriesLabelForFinding = (finding: { type?: string }): string => {
  switch (finding.type) {
    case "truncation":
      return "Truncated responses";
    case "rate-limit":
      return "429 / rate-limited calls";
    case "cost-spike":
    case "token-surge":
      return "LLM tokens";
    case "latency-spike":
    case "ttft-degradation":
      return "p95 latency";
    case "runaway-agent":
    case "within-trace-growth":
      return "Agent spans";
    default:
      return "Span volume";
  }
};

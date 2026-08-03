/**
 * Canned Demo Mode dataset for the Prompts page (main table + facets/sidebar,
 * the KPI tiles, the prompt-quality analytics panel, and the trace/topology/
 * logs/span-detail popups).
 *
 * Design (mirrors `ui/app/bedrock/demoData.ts`): rather than hand-typing each
 * hook's *output* shape directly, this module builds small "raw record"
 * fixtures shaped exactly like the rows each real DQL query returns, then each
 * consuming hook (`usePrompts`, `usePromptSummary`, `usePromptQuality`,
 * `useTraceSpans`, `useTraceLogs`, `usePromptSpanDetail`) runs those fixtures
 * through the SAME parse function production data flows through — this module
 * only builds the raw seed and stays a leaf (it imports ONLY types from the
 * hook files, which are erased at compile time, so there is no runtime import
 * cycle between this file and the hooks that both read from it and expose the
 * parse functions it conceptually feeds).
 *
 * The dataset: one small set of "demo traces" is the single source of truth.
 * Four traces are "rich" (multi-span: an agent-attributed root LLM call, a
 * tool call, and a follow-up LLM call that needs the trace→agent backfill —
 * exactly the shape `usePrompts`'s agent-map join exists for) plus fourteen
 * simple single-span traces spread across three AI apps (checkout-agent,
 * support-copilot, docs-assistant) and three providers (Bedrock-fronted
 * Anthropic, OpenAI, Google) — ~20 prompts total, with realistic prompt/
 * response text, token counts, latencies, a spread of eval scores (including
 * a couple of genuinely low-scoring rows across two different models so the
 * "worst models" breakdown has something to show), one truncated + PII
 * response, one guardrail-adjacent warning, and one errored call (rate limit)
 * so the table's error styling and the trace waterfall's error ring both
 * render for real. Every aggregate (KPI tiles, quality panel) is computed by
 * summarizing these SAME per-row fixtures, so nothing is hand-typed twice.
 */

import type { PromptRecord } from "./usePrompts";
import type { SummaryRecord } from "./usePromptSummary";
import type { QualityRecord } from "./usePromptQuality";
import type { SpanDetailRecord } from "./usePromptSpanDetail";
import type { TraceLogRecord } from "./useTraceLogs";

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const NOW_MS = Date.now();

interface DemoEval {
  hallucination?: number;
  correctness?: number;
  faithfulness?: number;
  relevance?: number;
}

interface DemoSpanSeed {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  /** Offset from the trace's t0, in ms. */
  offsetMs: number;
  durationMs: number;
  isRoot?: boolean;
  isError?: boolean;
  spanKind?: string;
  /** gen_ai.system */
  provider?: string;
  /** gen_ai.request.model / gen_ai.response.model */
  modelId?: string;
  /** gen_ai.operation.name */
  operation?: string;
  /** gen_ai.agent.name */
  agentName?: string;
  /** gen_ai.tool.name */
  toolName?: string;
  inTok?: number;
  outTok?: number;
  promptText?: string;
  responseText?: string;
  systemPrompt?: string;
  finishReason?: string;
  temperature?: number;
  maxTokens?: number;
  pii?: boolean;
  warning?: boolean;
  truncated?: boolean;
  exceptionType?: string;
  exceptionMsg?: string;
  eval?: DemoEval;
}

interface DemoTrace {
  traceId: string;
  service: string;
  t0Ms: number;
  spans: DemoSpanSeed[];
}

// ---------------------------------------------------------------------------
// Rich (multi-span) demo traces — agent → tool → LLM chains, an error, and a
// truncated+PII single-call trace.
// ---------------------------------------------------------------------------

const TRACE_BILLING: DemoTrace = {
  traceId: "trace-billing-1",
  service: "checkout-agent",
  t0Ms: NOW_MS - 35 * MIN_MS,
  spans: [
    {
      spanId: "billing-root-1",
      parentSpanId: null,
      name: "AgentExecutor.run",
      offsetMs: 0,
      durationMs: 4200,
      isRoot: true,
      provider: "bedrock",
      modelId: "us.anthropic.claude-sonnet-4-5-20250219-v1:0",
      operation: "chat",
      agentName: "billing-agent",
      inTok: 1200,
      outTok: 340,
      promptText:
        "Customer requests a refund for order #48213, citing a damaged item on arrival.",
      responseText:
        "Plan: verify the order status, check the return window, then issue a refund if eligible.",
      systemPrompt:
        "You are a billing support agent for an e-commerce platform. Investigate refund requests using the available tools before responding.",
      temperature: 0.3,
      finishReason: "stop",
      eval: { hallucination: 0.04, correctness: 0.92, faithfulness: 0.9, relevance: 0.94 },
    },
    {
      spanId: "billing-tool-1",
      parentSpanId: "billing-root-1",
      name: "tools.task",
      offsetMs: 4300,
      durationMs: 600,
      spanKind: "internal",
      toolName: "lookup_order",
    },
    {
      spanId: "billing-llm-2",
      parentSpanId: "billing-tool-1",
      name: "ChatCompletion",
      offsetMs: 5000,
      durationMs: 1900,
      provider: "bedrock",
      modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      operation: "chat",
      inTok: 1800,
      outTok: 260,
      promptText:
        "Order #48213 confirmed delivered 3 days ago; return window is 30 days; item flagged damaged-on-arrival.",
      responseText: "Refund approved for $84.50. Confirmation email queued to the customer.",
      temperature: 0.3,
      finishReason: "stop",
      eval: { hallucination: 0.03, correctness: 0.88, faithfulness: 0.91, relevance: 0.9 },
    },
  ],
};

const TRACE_TRIAGE: DemoTrace = {
  traceId: "trace-triage-1",
  service: "support-copilot",
  t0Ms: NOW_MS - 2 * HOUR_MS,
  spans: [
    {
      spanId: "triage-root-1",
      parentSpanId: null,
      name: "AgentExecutor.run",
      offsetMs: 0,
      durationMs: 5200,
      isRoot: true,
      provider: "google",
      modelId: "gemini-1.5-pro",
      operation: "chat",
      agentName: "triage-agent",
      inTok: 2400,
      outTok: 410,
      promptText: "Customer reports intermittent 500 errors on the checkout page since this morning.",
      responseText: "Triage plan: check recent deploys, search the known-issues KB, escalate if unresolved.",
      warning: true,
      temperature: 0.35,
      finishReason: "stop",
      eval: { hallucination: 0.08, correctness: 0.78, faithfulness: 0.81, relevance: 0.83 },
    },
    {
      spanId: "triage-tool-1",
      parentSpanId: "triage-root-1",
      name: "tools.task",
      offsetMs: 5300,
      durationMs: 450,
      spanKind: "internal",
      toolName: "search_kb",
    },
    {
      spanId: "triage-llm-2",
      parentSpanId: "triage-tool-1",
      name: "ChatCompletion",
      offsetMs: 5800,
      durationMs: 1200,
      provider: "google",
      modelId: "gemini-1.5-flash",
      operation: "chat",
      inTok: 900,
      outTok: 180,
      promptText:
        "KB match: known incident INC-2291, payment gateway timeout, workaround = retry with backoff.",
      responseText: "Provided the workaround to the customer and linked incident INC-2291 for tracking.",
      temperature: 0.35,
      finishReason: "stop",
      eval: { hallucination: 0.11, correctness: 0.7, faithfulness: 0.74, relevance: 0.76 },
    },
  ],
};

const TRACE_DOCS: DemoTrace = {
  traceId: "trace-docs-1",
  service: "docs-assistant",
  t0Ms: NOW_MS - 55 * MIN_MS,
  spans: [
    {
      spanId: "docs-llm-1",
      parentSpanId: null,
      name: "ChatCompletion",
      offsetMs: 0,
      durationMs: 2100,
      isRoot: true,
      provider: "openai",
      modelId: "gpt-4o-mini",
      operation: "chat",
      inTok: 3400,
      outTok: 512,
      promptText:
        "My email is jane.doe@example.com and phone is 555-0148 — can you update my account and explain the API rate limits in section 4?",
      responseText:
        "Sure, I've noted your contact details. Regarding section 4, the rate limit is 600 requests per minute per API key, with a small burst allowance for short spikes...",
      truncated: true,
      pii: true,
      temperature: 0.4,
      finishReason: "max_tokens",
      maxTokens: 512,
      eval: { hallucination: 0.15, correctness: 0.55, faithfulness: 0.6, relevance: 0.58 },
    },
  ],
};

const TRACE_ERROR: DemoTrace = {
  traceId: "trace-err-1",
  service: "checkout-agent",
  t0Ms: NOW_MS - 4 * HOUR_MS,
  spans: [
    {
      spanId: "err-root-1",
      parentSpanId: null,
      name: "ChatCompletion",
      offsetMs: 0,
      durationMs: 1400,
      isRoot: true,
      isError: true,
      provider: "openai",
      modelId: "gpt-4o",
      operation: "chat",
      agentName: "triage-agent",
      inTok: 1100,
      outTok: 0,
      promptText: "Summarize the last 20 error logs for the payment-service pod.",
      responseText: "",
      exceptionType: "openai.RateLimitError",
      exceptionMsg: "Rate limit reached for gpt-4o requests-per-minute. Limit: 500, Used: 500.",
    },
  ],
};

const RICH_TRACES: DemoTrace[] = [TRACE_BILLING, TRACE_TRIAGE, TRACE_DOCS, TRACE_ERROR];

// ---------------------------------------------------------------------------
// Standalone single-span traces — the bulk of everyday call volume.
// ---------------------------------------------------------------------------

interface StandaloneSpec {
  id: string;
  service: string;
  provider: string;
  modelId: string;
  operation?: string;
  offsetMs: number;
  durationMs: number;
  inTok: number;
  outTok: number;
  promptText: string;
  responseText: string;
  temperature?: number;
  warning?: boolean;
  pii?: boolean;
  eval?: DemoEval;
}

const STANDALONE: StandaloneSpec[] = [
  {
    id: "solo-1",
    service: "checkout-agent",
    provider: "bedrock",
    modelId: "us.anthropic.claude-sonnet-4-5-20250219-v1:0",
    offsetMs: 10 * MIN_MS,
    durationMs: 820,
    inTok: 640,
    outTok: 210,
    promptText: "What's the status of order #55210?",
    responseText: "Order #55210 shipped yesterday via FedEx, estimated delivery Thursday.",
    temperature: 0.2,
    eval: { hallucination: 0.02, correctness: 0.95, faithfulness: 0.96, relevance: 0.97 },
  },
  {
    id: "solo-2",
    service: "support-copilot",
    provider: "google",
    modelId: "gemini-1.5-flash",
    offsetMs: 40 * MIN_MS,
    durationMs: 410,
    inTok: 320,
    outTok: 95,
    promptText: "How do I reset my password?",
    responseText: "Go to Settings > Security > Reset Password and follow the emailed link.",
    temperature: 0.4,
    eval: { hallucination: 0.05, correctness: 0.9, faithfulness: 0.92, relevance: 0.93 },
  },
  {
    id: "solo-3",
    service: "docs-assistant",
    provider: "openai",
    modelId: "gpt-4o",
    operation: "completion",
    offsetMs: 72 * MIN_MS,
    durationMs: 1650,
    inTok: 2100,
    outTok: 480,
    promptText: "Explain the difference between the sync and async client in the SDK.",
    responseText:
      "The sync client blocks until a response returns; the async client uses asyncio and requires awaiting calls, which suits high-concurrency workloads.",
    temperature: 0.5,
    eval: { hallucination: 0.06, correctness: 0.85, faithfulness: 0.87, relevance: 0.89 },
  },
  {
    id: "solo-4",
    service: "checkout-agent",
    provider: "bedrock",
    modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    offsetMs: 108 * MIN_MS,
    durationMs: 350,
    inTok: 210,
    outTok: 60,
    promptText: "Cancel order #61120.",
    responseText: "Order #61120 has been cancelled and a refund initiated.",
    temperature: 0.1,
    eval: { hallucination: 0.03, correctness: 0.93, faithfulness: 0.94, relevance: 0.95 },
  },
  {
    id: "solo-5",
    service: "support-copilot",
    provider: "openai",
    modelId: "gpt-4o-mini",
    offsetMs: 150 * MIN_MS,
    durationMs: 980,
    inTok: 1500,
    outTok: 320,
    promptText: "Why was my last invoice higher than usual?",
    responseText:
      "Your plan usage exceeded the included quota by 12%, so overage charges applied per the rate card.",
    // Temperature deliberately omitted — exercises the "—" cell for tenants
    // that don't emit gen_ai.request.temperature on every call.
    eval: { hallucination: 0.09, correctness: 0.62, faithfulness: 0.65, relevance: 0.7 },
  },
  {
    id: "solo-6",
    service: "docs-assistant",
    provider: "google",
    modelId: "gemini-1.5-pro",
    operation: "completion",
    offsetMs: 186 * MIN_MS,
    durationMs: 2200,
    inTok: 3200,
    outTok: 610,
    promptText: "Walk me through configuring webhook signatures for the events API.",
    responseText:
      "1. Generate a signing secret in the dashboard. 2. Verify the X-Signature header using HMAC-SHA256 against the raw request body before processing.",
    temperature: 0.3,
    eval: { hallucination: 0.04, correctness: 0.91, faithfulness: 0.93, relevance: 0.9 },
  },
  {
    id: "solo-7",
    service: "checkout-agent",
    provider: "openai",
    modelId: "gpt-4o",
    offsetMs: 228 * MIN_MS,
    durationMs: 1450,
    inTok: 980,
    outTok: 240,
    promptText: "Apply promo code SAVE10 to cart #7789.",
    responseText: "Promo code SAVE10 applied — 10% discount, new total $58.30.",
    warning: true,
    temperature: 0.35,
    eval: { hallucination: 0.07, correctness: 0.8, faithfulness: 0.82, relevance: 0.84 },
  },
  {
    id: "solo-8",
    service: "support-copilot",
    provider: "bedrock",
    modelId: "us.anthropic.claude-sonnet-4-5-20250219-v1:0",
    offsetMs: 300 * MIN_MS,
    durationMs: 690,
    inTok: 540,
    outTok: 150,
    promptText: "The mobile app keeps crashing on login.",
    responseText:
      "Recommend clearing the app cache and updating to version 4.2.1, which fixed a known auth-token bug.",
    temperature: 0.25,
    eval: { hallucination: 0.05, correctness: 0.86, faithfulness: 0.88, relevance: 0.89 },
  },
  {
    id: "solo-9",
    service: "docs-assistant",
    provider: "openai",
    modelId: "gpt-4o-mini",
    offsetMs: 384 * MIN_MS,
    durationMs: 300,
    inTok: 180,
    outTok: 45,
    promptText: "What's the max file size for uploads?",
    responseText: "25 MB per file, 100 MB per request.",
    temperature: 0.2,
    // No eval scores at all — shows partial coverage on the quality panel.
  },
  {
    id: "solo-10",
    service: "checkout-agent",
    provider: "google",
    modelId: "gemini-1.5-flash",
    offsetMs: 474 * MIN_MS,
    durationMs: 540,
    inTok: 410,
    outTok: 120,
    promptText: "Is expedited shipping available for order #33021?",
    responseText: "Yes — upgrade to 2-day shipping for an additional $6.99.",
    temperature: 0.3,
    eval: { hallucination: 0.06, correctness: 0.83, faithfulness: 0.85, relevance: 0.87 },
  },
  {
    id: "solo-11",
    service: "support-copilot",
    provider: "bedrock",
    modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    offsetMs: 552 * MIN_MS,
    durationMs: 260,
    inTok: 190,
    outTok: 50,
    promptText: "Do you support SSO with Okta?",
    responseText: "Yes, SAML 2.0 SSO via Okta is supported on Enterprise plans.",
    temperature: 0.15,
  },
  {
    id: "solo-12",
    service: "docs-assistant",
    provider: "openai",
    modelId: "gpt-4o",
    operation: "completion",
    offsetMs: 660 * MIN_MS,
    durationMs: 1980,
    inTok: 2600,
    outTok: 590,
    promptText: "Compare rate limiting strategies: token bucket vs sliding window.",
    responseText:
      "Token bucket allows bursts up to the bucket size while refilling at a fixed rate; sliding window smooths the count continuously across the window boundary.",
    temperature: 0.45,
    eval: { hallucination: 0.12, correctness: 0.58, faithfulness: 0.61, relevance: 0.6 },
  },
  {
    id: "solo-13",
    service: "checkout-agent",
    provider: "bedrock",
    modelId: "us.anthropic.claude-sonnet-4-5-20250219-v1:0",
    offsetMs: 840 * MIN_MS,
    durationMs: 910,
    inTok: 720,
    outTok: 200,
    promptText: "Merge duplicate customer profiles for jane@acme.com.",
    responseText: "Profiles merged; order history and loyalty points consolidated under the primary account.",
    pii: true,
    temperature: 0.2,
    eval: { hallucination: 0.03, correctness: 0.9, faithfulness: 0.92, relevance: 0.93 },
  },
  {
    id: "solo-14",
    service: "support-copilot",
    provider: "google",
    modelId: "gemini-1.5-pro",
    offsetMs: 1080 * MIN_MS,
    durationMs: 3300,
    inTok: 4200,
    outTok: 760,
    promptText: "Draft a response to an angry customer whose shipment was lost in transit.",
    responseText:
      "Empathetic apology, offer of a full refund or reshipment, and an escalated tracking request with the carrier — closing with a goodwill discount on the next order.",
    temperature: 0.6,
    eval: { hallucination: 0.09, correctness: 0.76, faithfulness: 0.79, relevance: 0.8 },
  },
];

const standaloneToTrace = (s: StandaloneSpec): DemoTrace => ({
  traceId: `trace-${s.id}`,
  service: s.service,
  t0Ms: NOW_MS - s.offsetMs,
  spans: [
    {
      spanId: s.id,
      parentSpanId: null,
      name: "ChatCompletion",
      offsetMs: 0,
      durationMs: s.durationMs,
      isRoot: true,
      provider: s.provider,
      modelId: s.modelId,
      operation: s.operation ?? "chat",
      inTok: s.inTok,
      outTok: s.outTok,
      promptText: s.promptText,
      responseText: s.responseText,
      temperature: s.temperature,
      warning: s.warning,
      pii: s.pii,
      finishReason: "stop",
      eval: s.eval,
    },
  ],
});

const ALL_TRACES: DemoTrace[] = [...RICH_TRACES, ...STANDALONE.map(standaloneToTrace)];

// ---------------------------------------------------------------------------
// Raw "query row" fixtures — every consuming hook runs these through its own
// real parse function (see usePrompts.ts, usePromptSpanDetail.ts, etc.).
// ---------------------------------------------------------------------------

/** Only spans that carry a provider/system appear in the Prompts list query
 *  (`isNotNull(gen_ai.system) or isNotNull(gen_ai.provider.name)`) — tool
 *  spans are trace-detail-only, exactly like real telemetry. */
export const RAW_DEMO_PROMPT_RECORDS: PromptRecord[] = ALL_TRACES.flatMap((trace) =>
  trace.spans
    .filter((s) => s.provider)
    .map(
      (s): PromptRecord => ({
        timestamp: trace.t0Ms + s.offsetMs,
        kind: s.agentName ? "Agent" : "LLM",
        type_label: s.operation ?? "chat",
        service: trace.service,
        service_id: `SERVICE-DEMO-${trace.service}`,
        provider: s.provider ?? null,
        model: s.modelId ?? null,
        agent: s.agentName ?? null,
        temperature: s.temperature ?? null,
        in_tok: s.inTok ?? 0,
        out_tok: s.outTok ?? 0,
        duration_ms: s.durationMs,
        prompt_text: s.promptText ?? "",
        response_text: s.responseText ?? "",
        system_prompt: s.systemPrompt ?? null,
        pii_detected: !!s.pii,
        has_warning: !!s.warning,
        has_error: !!s.isError,
        truncated: !!s.truncated,
        eval_hallucination: s.eval?.hallucination ?? null,
        eval_correctness: s.eval?.correctness ?? null,
        eval_faithfulness: s.eval?.faithfulness ?? null,
        eval_relevance: s.eval?.relevance ?? null,
        trace_id: trace.traceId,
        span_id: s.spanId,
      }),
    ),
);

/** Trace → agent map (mirrors the real trace→agent lookup query's
 *  `takeFirst`-per-trace.id fold): only the rich traces carry a dedicated
 *  agent-attributed root whose name a same-trace LLM-only span needs
 *  backfilled. */
export const DEMO_TRACE_AGENT_MAP: Map<string, string> = new Map(
  RICH_TRACES.flatMap((trace) => {
    const agentSpan = trace.spans.find((s) => s.agentName);
    return agentSpan ? [[trace.traceId, agentSpan.agentName as string]] : [];
  }),
);

/** Full per-trace span sets (every span, including provider-less tool spans)
 *  for the Trace / Topology tabs — keyed by trace.id. */
export const RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID: Record<
  string,
  Record<string, unknown>[]
> = Object.fromEntries(
  ALL_TRACES.map((trace) => [
    trace.traceId,
    trace.spans.map((s) => ({
      "span.id": s.spanId,
      "span.parent_id": s.parentSpanId,
      "span.name": s.name,
      svc: trace.service,
      start_time: trace.t0Ms + s.offsetMs,
      end_time: trace.t0Ms + s.offsetMs + s.durationMs,
      dur_ms: s.durationMs,
      cpu_ms: Math.round(s.durationMs * 0.6),
      cpu_self_ms: Math.round(s.durationMs * 0.3),
      in_tok: s.inTok ?? 0,
      out_tok: s.outTok ?? 0,
      has_error: !!s.isError,
      "span.kind": s.spanKind ?? (s.provider ? "client" : "internal"),
      "span.status_code": s.isError ? "error" : "ok",
      "request.is_root_span": !!s.isRoot,
      "endpoint.name": s.provider ? "POST /v1/chat/completions" : null,
      "gen_ai.system": s.provider ?? null,
      "gen_ai.request.model": s.modelId ?? null,
      "gen_ai.response.model": s.modelId ?? null,
      "gen_ai.operation.name": s.operation ?? null,
      "gen_ai.agent.name": s.agentName ?? null,
      "gen_ai.tool.name": s.toolName ?? null,
      "exception.type": s.exceptionType ?? null,
      "exception.message": s.exceptionMsg ?? null,
      "traceloop.workflow.name": s.agentName ? `${s.agentName}.workflow` : null,
      "traceloop.entity.name": s.toolName ?? s.agentName ?? null,
      "traceloop.span.kind": s.toolName ? "tool" : s.agentName ? "workflow" : null,
      "span.status_message": s.isError ? s.exceptionMsg ?? "internal error" : null,
      "http.response.status_code": s.isError ? 429 : s.provider ? 200 : null,
    })),
  ]),
);

/** Correlated logs — only the four rich traces carry log fixtures; every
 *  standalone trace legitimately has none (a real, common state, not a bug). */
export const RAW_DEMO_TRACE_LOG_RECORDS_BY_TRACE_ID: Record<string, TraceLogRecord[]> = {
  "trace-billing-1": [
    {
      timestamp: TRACE_BILLING.t0Ms + 4400,
      status: "INFO",
      loglevel: "INFO",
      content: "Order #48213 located in orders-service DB, status=delivered.",
      span_id: "billing-tool-1",
      source: "orders-service",
    },
  ],
  "trace-triage-1": [
    {
      timestamp: TRACE_TRIAGE.t0Ms + 200,
      status: "WARN",
      loglevel: "WARN",
      content: "Elevated 5xx rate detected on checkout-service (12% over the last 5m).",
      span_id: "triage-root-1",
      source: "checkout-service",
    },
    {
      timestamp: TRACE_TRIAGE.t0Ms + 5350,
      status: "INFO",
      loglevel: "INFO",
      content: "KB search matched incident INC-2291 (payment gateway timeout).",
      span_id: "triage-tool-1",
      source: "kb-search",
    },
  ],
  "trace-docs-1": [
    {
      timestamp: TRACE_DOCS.t0Ms + 500,
      status: "WARN",
      loglevel: "WARN",
      content: "PII detected in request payload and redacted before storage.",
      span_id: "docs-llm-1",
      source: "docs-assistant",
    },
  ],
  "trace-err-1": [
    {
      timestamp: TRACE_ERROR.t0Ms + 1300,
      status: "ERROR",
      loglevel: "ERROR",
      content: "openai.RateLimitError: request throttled — 500/500 RPM used.",
      span_id: "err-root-1",
      source: "gpt-gateway",
    },
  ],
};

const SCOPE_FOR_PROVIDER: Record<string, string> = {
  bedrock: "traceloop.sdk.anthropic",
  openai: "opentelemetry.instrumentation.openai",
  google: "traceloop.sdk.google-generativeai",
};

/** Per-span detail (Info tab) — keyed by span.id, one entry per prompt row. */
export const RAW_DEMO_SPAN_DETAIL_RECORDS_BY_SPAN_ID: Record<string, SpanDetailRecord> =
  Object.fromEntries(
    ALL_TRACES.flatMap((trace) =>
      trace.spans
        .filter((s) => s.provider)
        .map((s): [string, SpanDetailRecord] => [
          s.spanId,
          {
            finish_reason: s.finishReason,
            temperature: s.temperature,
            max_tokens: s.maxTokens,
            status_code: s.isError ? "error" : "ok",
            request_model: s.modelId,
            response_model: s.modelId,
            provider: s.provider,
            scope: s.provider ? SCOPE_FOR_PROVIDER[s.provider] : undefined,
            span_kind: "client",
          },
        ]),
    ),
  );

/** Per-span ERROR/WARN log counts — most spans have neither; the two flagged
 *  spans below reconcile with the trace-log fixtures above. */
export const DEMO_SPAN_LOG_COUNTS_BY_SPAN_ID: Record<string, { error: number; warning: number }> = {
  "err-root-1": { error: 1, warning: 0 },
  "triage-root-1": { error: 0, warning: 1 },
  "docs-llm-1": { error: 0, warning: 1 },
};

// ---------------------------------------------------------------------------
// Aggregate raw records for the KPI tiles + quality panel — summed/averaged
// directly from RAW_DEMO_PROMPT_RECORDS (the SAME rows the table renders), so
// the tiles and the table can never drift apart. Each hook runs this through
// its own build*/parse function (buildPromptSummary / buildPromptQuality).
// ---------------------------------------------------------------------------

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : 0);
const countIf = <T>(xs: T[], pred: (x: T) => boolean): number => xs.filter(pred).length;

export const DEMO_PROMPT_SUMMARY_RAW: SummaryRecord = {
  total: RAW_DEMO_PROMPT_RECORDS.length,
  avg_duration_ms: avg(RAW_DEMO_PROMPT_RECORDS.map((r) => r.duration_ms ?? 0)),
  avg_input_tokens: avg(RAW_DEMO_PROMPT_RECORDS.map((r) => r.in_tok ?? 0)),
  avg_output_tokens: avg(RAW_DEMO_PROMPT_RECORDS.map((r) => r.out_tok ?? 0)),
  pii_detected: countIf(RAW_DEMO_PROMPT_RECORDS, (r) => r.pii_detected === true),
  warnings: countIf(RAW_DEMO_PROMPT_RECORDS, (r) => r.has_warning === true),
  errors: countIf(RAW_DEMO_PROMPT_RECORDS, (r) => r.has_error === true),
  truncated: countIf(RAW_DEMO_PROMPT_RECORDS, (r) => r.truncated === true),
};

const evalAvgPct = (key: keyof PromptRecord): number | null => {
  const vals = RAW_DEMO_PROMPT_RECORDS.map((r) => r[key])
    .filter((v): v is number => typeof v === "number");
  return vals.length ? avg(vals) * 100 : null;
};
const evalCoverage = (key: keyof PromptRecord): number =>
  countIf(RAW_DEMO_PROMPT_RECORDS, (r) => typeof r[key] === "number");

export const DEMO_PROMPT_QUALITY_RAW: QualityRecord = {
  total: RAW_DEMO_PROMPT_RECORDS.length,
  hallucination_pct: evalAvgPct("eval_hallucination"),
  correctness_pct: evalAvgPct("eval_correctness"),
  faithfulness_pct: evalAvgPct("eval_faithfulness"),
  relevance_pct: evalAvgPct("eval_relevance"),
  with_halluc: evalCoverage("eval_hallucination"),
  with_correct: evalCoverage("eval_correctness"),
  with_faith: evalCoverage("eval_faithfulness"),
  with_rel: evalCoverage("eval_relevance"),
};

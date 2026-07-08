/* ============================================================
 * AI Application Architecture — node-map data model
 * Fleet-wide gen_ai.* span rollups for the 24h window.
 * window.AIOBS = { LENSES, NODES, EDGES, LOOP, LAYERS, SPARK, SCOPE }
 * ============================================================ */
(function () {
  const LENSES = {
    overview: { id: "overview", label: "Overview", unitLabel: "spend" },
    "cut-cost": {
      id: "cut-cost", label: "Cut cost", unitLabel: "spend",
      banner: {
        status: "critical", layer: "LLM provider API",
        headline: "LLM calls are 71% of fleet spend.",
        detail: "gpt-4o on summarize_agent drives $18.9K of the $26.6K window total. Most calls are short summaries a smaller model handles well.",
        action: "Route 40% of summarize_agent to gpt-4o-mini", savings: "≈ $7.6K / mo",
      },
    },
    "chase-latency": {
      id: "chase-latency", label: "Chase latency", unitLabel: "p90 latency",
      banner: {
        status: "critical", layer: "Orchestrator",
        headline: "Orchestration wait dominates end-to-end latency.",
        detail: "The plan → act → reflect step holds requests for a p90 of 4.8 s — 6× the agent and tool spans beneath it. Reflection re-runs are the main contributor.",
        action: "Cap reflect retries and parallelize independent tool calls", savings: "≈ 3.1 s off p90",
      },
    },
    "stop-a-loop": {
      id: "stop-a-loop", label: "Stop a loop", unitLabel: "loop rate",
      banner: {
        status: "critical", layer: "Orchestrator",
        headline: "63% of workflows re-enter the same step.",
        detail: "research_agent loops plan → act → reflect without a termination signal. Each loop spawns fresh agent and tool spans, inflating cost and latency downstream.",
        action: "Set max_iterations = 6 and add a confidence stop condition", savings: "≈ 41% fewer agent spans",
      },
    },
  };

  // tone keys map to CSS: gray | critical | warning | good | cost
  // id (optional) links a badge to a rich finding in DETAILS
  const b = (t, tone, id) => ({ t, tone: tone || "gray", id: id || null });

  const NODES = [
    {
      id: "client", name: "Client", category: "edge", instrumented: false,
      otel: false, note: "no native OTel", drill: null, findings: 0,
      sub: "no native OTel · identity source",
      desc: "No native OTel GenAI spans. Identity (session.id, gen_ai.user) must be propagated from here for per-user attribution.",
      lens: {
        overview: { status: "muted", sub: "no native OTel · identity source" },
        "cut-cost": { status: "muted", sub: "no cost signal" },
        "chase-latency": { status: "muted", sub: "no span timing" },
        "stop-a-loop": { status: "muted", sub: "no loop signal" },
      },
    },
    {
      id: "gateway", name: "Gateway / Proxy", category: "edge", instrumented: false,
      otel: false, note: "no native OTel", drill: null, findings: 0,
      sub: "no native OTel", enrich: "+ enrich: injection",
      desc: "No native OTel GenAI spans; HTTP/proxy spans only. Best place to enrich spans with security and identity context.",
      lens: {
        overview: { status: "muted", sub: "no native OTel" },
        "cut-cost": { status: "muted", sub: "no cost signal" },
        "chase-latency": { status: "muted", sub: "92 ms proxy hop" },
        "stop-a-loop": { status: "muted", sub: "no loop signal" },
      },
    },
    {
      id: "orchestrator", name: "Orchestrator", category: "core", instrumented: true,
      spans: 144053, spansLabel: "workflow spans", drill: "Agents", findings: 1, findingTone: "critical",
      mini: [3, 4, 4, 5, 5, 7, 8, 9],
      contributors: [
        { name: "research_agent", value: 0.46, meta: "plan → act → reflect" },
        { name: "support_router", value: 0.27, meta: "intent → route" },
        { name: "ingest_planner", value: 0.18, meta: "chunk → embed" },
        { name: "billing_flow", value: 0.09, meta: "lookup → confirm" },
      ],
      lens: {
        overview: { status: "critical", headline: "144,053", sub: "workflow spans", badges: [b("loop rate 63%", "critical", "loop")] },
        "cut-cost": { status: "warning", headline: "$3.2K", sub: "orchestration overhead", badges: [b("12% of spend", "warning")] },
        "chase-latency": { status: "critical", headline: "4.8 s", sub: "p90 wait", badges: [b("plan→act→reflect", "critical")] },
        "stop-a-loop": { status: "critical", headline: "63%", sub: "loop rate", badges: [b("research_agent", "critical")] },
      },
    },
    {
      id: "agent", name: "Agent", category: "core", instrumented: true,
      spans: 370260, spansLabel: "agent spans", drill: "Agents", findings: 2, findingTone: "warning",
      mini: [5, 5, 6, 5, 6, 5, 6, 6],
      contributors: [
        { name: "research_agent", value: 0.52, meta: "19 tools · gpt-4o" },
        { name: "summarize_agent", value: 0.24, meta: "4 tools · gpt-4o" },
        { name: "support_agent", value: 0.15, meta: "7 tools · gpt-4o-mini" },
        { name: "billing_agent", value: 0.09, meta: "3 tools · gpt-4o-mini" },
      ],
      lens: {
        overview: { status: "warning", headline: "370,260", sub: "agent spans", badges: [b("0.0% err"), b("p90 1 ms")] },
        "cut-cost": { status: "good", headline: "$1.1K", sub: "agent runtime", badges: [b("4% of spend")] },
        "chase-latency": { status: "good", headline: "1 ms", sub: "p90 self time", badges: [b("0.0% err")] },
        "stop-a-loop": { status: "critical", headline: "41%", sub: "spans inside loops", badges: [b("amplified by orchestrator", "critical")] },
      },
    },
    {
      id: "tools", name: "Tool execution", category: "resource", instrumented: true,
      spans: 85265, spansLabel: "tool calls", drill: "Explorer", findings: 1, findingTone: "warning",
      mini: [4, 5, 4, 6, 5, 6, 5, 7],
      contributors: [
        { name: "web.search", value: 0.38, meta: "external · 71 tools total" },
        { name: "vector.query", value: 0.29, meta: "internal" },
        { name: "sql.run", value: 0.2, meta: "internal" },
        { name: "http.fetch", value: 0.13, meta: "external" },
      ],
      lens: {
        overview: { status: "good", headline: "85,265", sub: "tool calls", badges: [b("N+1 ×412", "warning", "agent-tools")] },
        "cut-cost": { status: "good", headline: "$0.3K", sub: "tool calls", badges: [b("1% of spend")] },
        "chase-latency": { status: "warning", headline: "320 ms", sub: "p90 external", badges: [b("web.search", "warning")] },
        "stop-a-loop": { status: "warning", headline: "2.4×", sub: "retries in loops", badges: [b("web.search", "warning")] },
      },
    },
    {
      id: "llm", name: "LLM provider API", category: "resource", instrumented: true, tint: "warning",
      spans: 176566, spansLabel: "calls", drill: "Models / FinOps", findings: 3, findingTone: "warning",
      mini: [3, 3, 4, 9, 4, 5, 4, 5],
      contributors: [
        { name: "gpt-4o", value: 0.71, meta: "summarize_agent · research_agent" },
        { name: "gpt-4o-mini", value: 0.21, meta: "support · billing" },
        { name: "text-embedding-3", value: 0.08, meta: "ingest_planner" },
      ],
      lens: {
        overview: { status: "good", headline: "176,566", sub: "calls", badges: [b("$411"), b("ctx-exhaust ×12", "warning", "agent-llm")] },
        "cut-cost": { status: "critical", headline: "$18.9K", sub: "71% of spend", badges: [b("gpt-4o", "critical")] },
        "chase-latency": { status: "warning", headline: "2.1 s", sub: "p90 generation", badges: [b("gpt-4o", "warning")] },
        "stop-a-loop": { status: "good", headline: "—", sub: "no self-loops", badges: [] },
      },
    },
    {
      id: "vector", name: "Vector DB / RAG", category: "resource", instrumented: false,
      otel: false, note: "inferred from tool spans", drill: "Explorer", findings: 0,
      sub: "12.4k queries · top-k 8", enrich: "+ eval: hallucination",
      desc: "No native gen_ai spans — retrieval is inferred from tool.vector spans. Add a RAG eval to catch hallucination and low-recall retrievals.",
      lens: {
        overview: { status: "good", sub: "12.4k queries · top-k 8" },
        "cut-cost": { status: "good", sub: "$0.1K embeddings" },
        "chase-latency": { status: "good", sub: "38 ms p90" },
        "stop-a-loop": { status: "warning", sub: "re-queried in loops" },
      },
    },
    {
      id: "memory", name: "Memory / state", category: "resource", instrumented: false,
      otel: false, note: "no native OTel", drill: null, findings: 0,
      sub: "session state · history",
      desc: "Conversation state and history store. No native gen_ai spans; instrument reads/writes to attribute context-window growth.",
      lens: {
        overview: { status: "muted", sub: "session state · history" },
        "cut-cost": { status: "muted", sub: "drives context size" },
        "chase-latency": { status: "muted", sub: "no span timing" },
        "stop-a-loop": { status: "muted", sub: "no loop signal" },
      },
    },
  ];

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  const EDGES = [
    { from: "client", to: "gateway", w: 0.22, rate: "3.4K spans/min" },
    { from: "gateway", to: "orchestrator", w: 0.3, rate: "3.3K spans/min" },
    { from: "orchestrator", to: "agent", w: 1.0, rate: "9.1K spans/min" },
    { from: "agent", to: "tools", w: 0.5, finding: true, fid: "agent-tools", flabel: "N+1 ×412", tone: "warning", rate: "2.0K calls/min" },
    { from: "agent", to: "llm", w: 0.62, finding: true, fid: "agent-llm", flabel: "ctx ×12", tone: "warning", rate: "2.6K calls/min" },
    { from: "tools", to: "vector", w: 0.3, finding: true, fid: "tools-vector", flabel: "recall 61%", tone: "warning", rate: "0.9K queries/min" },
    { from: "llm", to: "memory", w: 0.22, rate: "0.6K writes/min" },
  ];
  // feedback loop edge (dashed, magenta) from llm back up to orchestrator
  const LOOP = { from: "llm", to: "orchestrator", label: "LOOP 63%", rate: "1.9K re-entries/min" };

  // Per-lens spotlight: which nodes/edges to emphasize (others dim). edge key = from-to.
  const LENS_SPOTLIGHT = {
    "cut-cost": { nodes: ["orchestrator", "agent", "llm"], edges: ["orchestrator-agent", "agent-llm"], loop: false },
    "chase-latency": { nodes: ["gateway", "orchestrator", "agent"], edges: ["gateway-orchestrator", "orchestrator-agent"], loop: false },
    "stop-a-loop": { nodes: ["orchestrator", "agent"], edges: ["orchestrator-agent"], loop: true },
  };

  // Rich finding/enrichment detail shown in the popup modal when a pill is clicked.
  const DETAILS = {
    loop: {
      title: "Reflection loop", severity: "critical", scope: "Orchestrator → Agent → LLM",
      what: "research_agent re-enters plan → act → reflect without a termination signal.",
      why: "Every pass spawns fresh agent and tool spans and repeats LLM calls, so cost and latency compound with each iteration.",
      metrics: [{ k: "Loop rate", v: "63%" }, { k: "Avg iterations", v: "4.2" }, { k: "Spans amplified", v: "+41%" }, { k: "Est. waste", v: "$7.1K / mo" }],
      action: "Set max_iterations = 6 and add a confidence stop condition", drill: "Agents",
    },
    "agent-tools": {
      title: "N+1 tool calls", severity: "warning", scope: "Agent → Tool execution",
      what: "research_agent calls web.search once per result instead of batching the lookups.",
      why: "412 redundant tool spans per hour add latency and external-API cost without surfacing new information.",
      metrics: [{ k: "Extra calls", v: "×412 / h" }, { k: "Added p90", v: "+180 ms" }, { k: "Tool spend", v: "+$0.2K / mo" }],
      action: "Batch web.search inputs or cache results by query", drill: "Explorer",
    },
    "agent-llm": {
      title: "Oversized prompts", severity: "warning", scope: "Agent → LLM provider API",
      what: "The full conversation history is re-sent on every LLM call; 12 calls hit the context limit and were truncated.",
      why: "Large prompts inflate input-token cost and raise generation latency, and truncation silently drops grounding context.",
      metrics: [{ k: "Avg prompt", v: "8.4K tok" }, { k: "Context exhausted", v: "×12" }, { k: "Input spend", v: "+$3.1K / mo" }],
      action: "Summarize history past 6 turns and trim tool output", drill: "Prompts",
    },
    "tools-vector": {
      title: "Low-recall retrieval", severity: "warning", scope: "Tool execution → Vector DB / RAG",
      what: "top-k 8 returns relevant chunks for only 61% of queries; the agent re-queries on misses.",
      why: "Misses trigger extra tool and LLM passes and raise hallucination risk on answers that aren't grounded.",
      metrics: [{ k: "Recall", v: "61%" }, { k: "Re-query rate", v: "22%" }, { k: "Hallucination flags", v: "14" }],
      action: "Raise top-k, add reranking, and run the RAG eval", drill: "Explorer",
    },
    "enrich-gateway": {
      title: "Enrich at the gateway", severity: "info", scope: "Gateway / Proxy",
      what: "The gateway sees every request but emits no gen_ai spans today.",
      why: "An enrichment rule here tags downstream spans with session.id and a prompt-injection verdict before they fan out — the earliest point for identity and security context.",
      metrics: [{ k: "Requests seen", v: "212K / day" }, { k: "Currently tagged", v: "0%" }],
      action: "Add the prompt-injection + identity enrichment rule", drill: null,
    },
    "enrich-vector": {
      title: "Add a RAG eval", severity: "info", scope: "Vector DB / RAG",
      what: "Retrieval is inferred from tool.vector spans with no quality signal attached.",
      why: "A hallucination and recall eval scores each retrieval so you can catch ungrounded answers before they reach users.",
      metrics: [{ k: "Queries", v: "12.4K" }, { k: "Eval coverage", v: "0%" }],
      action: "Enable the hallucination eval on tool.vector spans", drill: "Explorer",
    },
    "cost-spike": {
      title: "LLM cost up 14%", severity: "critical", scope: "LLM provider API",
      what: "Window spend rose to $26.6K, driven almost entirely by gpt-4o summaries on summarize_agent.",
      why: "Spend is growing faster than span volume — the average call is getting more expensive, not just more frequent.",
      metrics: [{ k: "Window spend", v: "$26.6K" }, { k: "vs prior", v: "+14%" }, { k: "gpt-4o share", v: "71%" }],
      action: "Route 40% of summarize_agent to gpt-4o-mini", drill: "Models / FinOps",
    },
    "scope-services": {
      title: "7 services with AI spans", severity: "neutral", scope: "Fleet-wide · last 24h",
      what: "7 of 23 monitored services emit gen_ai.* spans this window — checkout-api, support-bot, and ingest-worker lead by volume. The rest have no AI activity or aren't instrumented.",
      why: "Each service maps to one or more tiers in the diagram. Coverage here decides which tiers can be measured natively versus inferred from neighboring spans.",
      metrics: [{ k: "With AI spans", v: "7" }, { k: "Monitored", v: "23" }, { k: "Uninstrumented tiers", v: "2" }],
      action: null, drill: "Explorer",
    },
    "scope-agents": {
      title: "19 agents", severity: "neutral", scope: "Fleet-wide · last 24h",
      what: "19 distinct gen_ai.agent identities ran this window across 7 services. research_agent and summarize_agent drive most of the agent spans.",
      why: "Agents are the unit of the Agent tier — per-agent cost, loop rate, and error rate roll up there. Three agents are currently caught in orchestration loops.",
      metrics: [{ k: "Active agents", v: "19" }, { k: "Busiest", v: "research_agent" }, { k: "In loops", v: "3" }],
      action: null, drill: "Agents",
    },
    "scope-tools": {
      title: "71 tools", severity: "neutral", scope: "Fleet-wide · last 24h",
      what: "71 distinct tools were invoked via gen_ai.tool spans, from web.search to internal SQL and vector queries.",
      why: "Tool calls feed the Tool execution tier — fan-out and external-API latency here are common cost and latency drivers.",
      metrics: [{ k: "Distinct tools", v: "71" }, { k: "External", v: "24" }, { k: "Top by volume", v: "web.search" }],
      action: null, drill: "Explorer",
    },
    "scope-findings": {
      title: "7 active findings", severity: "warning", scope: "Fleet-wide · last 24h",
      what: "7 open findings across the request path: 2 critical, 3 warnings, and 2 instrumentation suggestions.",
      why: "Findings surface as pills and badges on the diagram and in the list below the map. Critical items affect cost or reliability right now.",
      metrics: [{ k: "Critical", v: "2" }, { k: "Warning", v: "3" }, { k: "Suggestions", v: "2" }],
      action: null, drill: null,
    },
  };

  // Resolve a click spec to a detail object for the modal.
  function getDetail(spec) {
    if (!spec) return null;
    if (spec.loop) return DETAILS.loop;
    if (spec.scope) return DETAILS["scope-" + spec.scope] || null;
    if (spec.finding) return DETAILS[spec.finding] || null;
    if (spec.enrich) return DETAILS["enrich-" + spec.enrich] || null;
    if (spec.badge) {
      const bd = spec.badge;
      if (bd.id && DETAILS[bd.id]) return DETAILS[bd.id];
      return {
        title: bd.t, severity: bd.tone && bd.tone !== "gray" ? bd.tone : "neutral",
        scope: spec.node || "",
        what: "\u201c" + bd.t + "\u201d on " + (spec.node || "this tier") + ", derived from gen_ai.* spans in the selected timeframe.",
        why: "Open the tier for the contributing spans and how this metric trends across the window.",
        metrics: spec.metrics || [], action: null, drill: spec.drill || null,
      };
    }
    return null;
  }

  // legacy 6-layer list for the layered / flow alternate views + drawer
  const LAYERS = ["client", "gateway", "orchestrator", "agent", "tools", "llm"].map((id) => byId[id]);

  function series(seed, base, jitter) {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const n = Math.sin((i + seed) * 0.7) * jitter + (Math.cos((i + seed) * 1.3) * jitter) / 2;
      out.push(Math.round(Math.max(base * 0.4, base + n)));
    }
    return out;
  }
  const SPARK = {
    orchestrator: series(2, 6000, 1800), agent: series(5, 15400, 5200),
    tools: series(1, 3600, 1400), llm: series(8, 6500, 2400),
  };

  const SCOPE = { services: 7, agents: 19, tools: 71, findings: 7, refreshed: "29m ago", range: "48 hours ago → 24 hours ago" };

  // ── Pulse page (below the map) ──────────────────────────────
  const KPIS = [
    { k: "AI spans", v: "971K", delta: "+8.2%", dir: "up", tone: "neutral", spark: "agent" },
    { k: "Token spend", v: "$26.6K", delta: "+14%", dir: "up", tone: "bad", spark: "llm" },
    { k: "p90 latency", v: "5.9 s", delta: "+21%", dir: "up", tone: "bad", spark: "orchestrator" },
    { k: "Error rate", v: "0.3%", delta: "-0.1 pp", dir: "down", tone: "good" },
    { k: "Loop rate", v: "63%", delta: "+12 pp", dir: "up", tone: "bad" },
    { k: "Active findings", v: "7", delta: "+2", dir: "up", tone: "bad" },
  ];

  const MODELS = [
    { name: "gpt-4o", color: "#134fc9", share: 0.71 },
    { name: "gpt-4o-mini", color: "#438fb1", share: 0.21 },
    { name: "text-embedding-3", color: "#84859a", share: 0.08 },
  ];
  // 24 hourly token totals (millions of tokens), deterministic
  const TOKENS = (function () {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const base = 56 + Math.sin(i * 0.6) * 12 + Math.cos(i * 1.7) * 6 + (i > 14 ? (i - 14) * 1.4 : 0);
      out.push(Math.max(28, base));
    }
    return out;
  })();

  const AGENTS_COST = [
    { name: "research_agent", cost: "$11.2K", pct: 0.42, model: "gpt-4o" },
    { name: "summarize_agent", cost: "$7.6K", pct: 0.29, model: "gpt-4o" },
    { name: "support_agent", cost: "$3.1K", pct: 0.12, model: "gpt-4o-mini" },
    { name: "ingest_planner", cost: "$2.4K", pct: 0.09, model: "text-embedding-3" },
    { name: "billing_agent", cost: "$2.1K", pct: 0.08, model: "gpt-4o-mini" },
  ];

  // 7 active findings; spec resolves through getDetail for the popup.
  const FINDINGS = [
    { spec: { loop: true }, severity: "critical", title: "Reflection loop", scope: "Orchestrator", metric: "63% loop rate" },
    { spec: { finding: "cost-spike" }, severity: "critical", title: "LLM cost up 14%", scope: "LLM provider API", metric: "$26.6K spend" },
    { spec: { finding: "agent-llm" }, severity: "warning", title: "Oversized prompts", scope: "Agent → LLM", metric: "8.4K tok avg" },
    { spec: { finding: "agent-tools" }, severity: "warning", title: "N+1 tool calls", scope: "Agent → Tool execution", metric: "×412 / h" },
    { spec: { finding: "tools-vector" }, severity: "warning", title: "Low-recall retrieval", scope: "Tool execution → Vector DB", metric: "61% recall" },
    { spec: { enrich: "gateway" }, severity: "info", title: "Unscanned injection surface", scope: "Gateway / Proxy", metric: "0% tagged" },
    { spec: { enrich: "vector" }, severity: "info", title: "Missing RAG eval", scope: "Vector DB / RAG", metric: "0% coverage" },
  ];

  window.AIOBS = { LENSES, NODES, EDGES, LOOP, LENS_SPOTLIGHT, DETAILS, getDetail, LAYERS, SPARK, SCOPE, byId, KPIS, MODELS, TOKENS, AGENTS_COST, FINDINGS };
})();

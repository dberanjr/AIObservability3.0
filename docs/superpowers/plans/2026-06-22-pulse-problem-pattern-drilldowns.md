# Pulse Problem-Pattern Drill-downs — Implementation Plan

> Execute with superpowers:subagent-driven-development. Each detected problem pattern in a Pulse tier drawer becomes a clickable drill-down that opens a target tab via a `?focus=<id>` deep-link and filters the data to that pattern.

**Goal:** Make the "Problem patterns at this tier" entries in the Pulse `NodeDrawer` actionable. Clicking a **detected** pattern navigates to a target tab (Prompts and/or Agents) with `?focus=<patternId>`; the destination tab interprets the focus, applies the pattern's query predicate, and shows a removable "Filtered: <label>" chip. **Reference / needs-enrichment** patterns render shown-but-disabled with a "why not" tooltip.

**Decisions (from the user):**
- Per-pattern best-fit target tab; patterns like N+1 / tool-retry offer BOTH Agents and Prompts drill targets (a pattern may have multiple `drills`).
- Only `detected` patterns are clickable. `reference` / `needs-enrichment` are listed, dimmed, non-clickable, with a tooltip explaining why (not derivable from spans / needs evaluation enrichment).

**Mechanism:** a `focus` query param on the destination route (the app already uses `?focus=` for tier redirects). The destination page maps `focus → predicate` and applies it as a page-local filter (NOT the global attribute filter — most predicates aren't attribute=value). Shows a removable chip; clearing it drops the param.

**Key files (verify at execution):**
- `ui/app/pages/Pulse/archMap/ai-layer-patterns.ts` — the per-tier problem-pattern data the drawer renders. Extend each pattern with `status` + `drills`.
- `ui/app/pages/Pulse/archMap/NodeDrawer.tsx` — renders the patterns; make detected ones clickable (navigate), dim the rest.
- `ui/app/pages/Prompts/PromptsPage.tsx` + `queries.ts` — interpret `focus`, apply predicate, render chip.
- `ui/app/pages/Agents/AgentsPage.tsx` + `queries.ts` — same for agent-level focuses.
- Reuse existing predicates: `LOGICAL_ERROR_EXPR` (scope/queries.ts), truncation logic (Prompts), N+1 detection (Agents `N+1` badge), `mcpNotLifecycleClause`.

**Validation rule (every focus predicate):** before marking a task done, run the destination query with the focus predicate against ualpre over `now()-24h` (use `mcp__ualpre__execute-dql`); it must return without DQL-SYNTAX-ERROR and (where data exists) return the expected matching rows. Per repo memory: named summarize fields, `toUid()` for trace.id, counts come back as strings (coerce). Deploy after each shippable phase (standing auth: set env URL → `npm run deploy` → revert placeholder).

---

## Pattern catalog (status + drills + predicate)

Source of truth to encode in `ai-layer-patterns.ts`. `tab` is the destination; `focus` is the URL id; predicate is what the destination applies.

### LLM tier → Prompts
| id (focus) | label | status | drills | predicate (destination = Prompts, LLM spans) |
|---|---|---|---|---|
| `llm-ctx-exhaustion` | Context-window exhaustion | detected | Prompts | `contains(toString(gen_ai.response.finish_reasons), "max_tokens") or contains(..., "length")` (reuse Prompts truncation logic) |
| `llm-logical-errors` | Logical errors | detected | Prompts | `LOGICAL_ERROR_EXPR` (the shared logical-error rule) |
| `llm-ttft-degradation` | TTFT degradation | detected (capability-gated on ttft) | Prompts | `isNotNull(gen_ai.response.ttft)` and sort by ttft desc (surface worst); gate if no ttft emitted |
| `llm-model-mismatch` | Model fallback / request-vs-response mismatch | detected | Prompts | `isNotNull(gen_ai.response.model) and normalizeModel(gen_ai.request.model) != normalizeModel(gen_ai.response.model)` (strip version suffix) |
| `llm-rate-limit` | Provider rate-limit / backoff | detected | Prompts | `toLong(coalesce(http.response.status_code,0)) == 429` |
| `llm-retrieval-hallucination` | Retrieval hallucination | needs-enrichment | — | dimmed; tooltip: emit `gen_ai.evaluation.*` (groundedness/hallucination) |

### Tools tier → Agents + Prompts
| id | label | status | drills | predicate |
|---|---|---|---|---|
| `tool-retry-storm` | Tool retry storm | detected | Agents, Prompts | tool spans with error; surface traces/agents with repeated same-tool failures (`traceloop.span.kind=="tool"` + error, grouped, high retry count) |
| `tool-token-spike` | Tool-output → token spike | detected | Prompts, Agents | LLM spans with large input tokens immediately following a tool span in-trace (approx: high `gen_ai.usage.input_tokens` on calls preceded by a tool) |
| `tool-parallel-race` | Parallel tool race conditions | reference | — | dimmed; not detectable from spans |

### Agent tier → Agents (+ Prompts)
| id | label | status | drills | predicate |
|---|---|---|---|---|
| `agent-n1-tool-calls` | High-frequency tool calls (N+1) | detected | Agents, Prompts | agents whose per-trace tool-call count is high (reuse the Agents `N+1` detection) |
| `agent-degradation` | Agent error / degradation | detected | Agents | agents sorted by error rate / p90 latency (rising); filter to non-zero error agents |

### Vector DB / RAG tier → Agents (+ Prompts)
| id | label | status | drills | predicate |
|---|---|---|---|---|
| `vdb-topk-over-retrieval` | Top-K over-retrieval | detected | Agents, Prompts | spans with `vector_db.query.top_k` above a threshold (e.g. > 10), or sorted desc |
| `vdb-metadata-filter` | Missing metadata-filter scope errors | reference | — | dimmed |
| `vdb-embedding-mismatch` | Embedding-model mismatch | reference | — | dimmed |

### Memory / State tier → Agents (+ Prompts)
| id | label | status | drills | predicate |
|---|---|---|---|---|
| `mem-history-growth` | History growth | detected | Agents, Prompts | conversations/threads with growing state — spans with `gen_ai.conversation.id` / `traceloop.association.properties.thread_id` / `langgraph_checkpoint_ns`, grouped, high turn count |
| `mem-stale-ttl` | Stale-TTL context loss | reference | — | dimmed |
| `mem-write-conflicts` | Multi-agent state write conflicts | reference | — | dimmed |

---

## Tasks

**Phase 1 — Data + drawer (foundational)**
- **Task 1:** Extend `ai-layer-patterns.ts` patterns with `status: "detected"|"reference"|"needs-enrichment"` and `drills: { tab, focus, label }[]` per the catalog. Pure data + a unit test asserting every `detected` pattern has ≥1 drill and every `reference`/`needs-enrichment` has none; every `focus` id is unique. No ualpre.
- **Task 2:** `NodeDrawer.tsx` — render each pattern: detected → clickable row(s) with the drill target(s) ("→ Prompts" / "→ Agents") that `navigate(\`/<tab>?focus=<id>\` , carrying timeframe)`; reference/needs-enrichment → dimmed, non-interactive, `title` tooltip with the reason. Accessible (button/role/keyboard). Typecheck + build.

**Phase 2 — Prompts focus presets**
- **Task 3:** Prompts page interprets `?focus=` for the LLM patterns (`llm-ctx-exhaustion`, `llm-logical-errors`, `llm-model-mismatch`, `llm-rate-limit`, `llm-ttft-degradation`) — a `FOCUS_PREDICATES` map injected into `buildPromptsListQuery`, plus a removable "Filtered: <label>" chip (clearing removes the param). ualpre-validate each predicate. Register a reset handler so global Reset clears the focus too.
- **Task 4:** Prompts focus presets for the tool/agent/vdb/memory patterns that drill to Prompts (`tool-token-spike`, `tool-retry-storm`, `agent-n1-tool-calls`, `vdb-topk-over-retrieval`, `mem-history-growth`). ualpre-validate.

**Phase 3 — Agents focus presets**
- **Task 5:** Agents page interprets `?focus=` for `agent-n1-tool-calls`, `agent-degradation`, `tool-retry-storm`, `vdb-topk-over-retrieval`, `mem-history-growth` — applies the agent-level predicate/sort + chip + reset handler. ualpre-validate.

**Phase 4 — Ship**
- **Task 6:** Version bump, full verify (tsc/vitest/build/eslint), commit, deploy to ualpre, smoke-check each drawer pattern → lands on the right tab, filtered, with a removable chip.

---

## Notes / risks
- Most predicates are page-local (not the global attribute filter) because they're comparisons/thresholds/aggregates, not `attr=value`. Keep them in the destination page's query builder behind the `focus` map; do NOT route through `injectGlobalFilters`.
- `focus` chip must be removable and cleared by global **Reset** (register a reset handler like Explorer/Prompts already do).
- Model normalization for `llm-model-mismatch`: reuse the app's `canonicalizeModel`/`normalizeModelKey` so version-suffix-only differences don't false-positive.
- Aggregate patterns (N+1, degradation, history growth) may filter to the *entities* (agents/conversations) rather than individual spans — acceptable; the destination tab decides the natural granularity.
- Keep "detected" honest: if a predicate can't be validated on ualpre (no such data), still ship it (it's correct), but note it in the task report.

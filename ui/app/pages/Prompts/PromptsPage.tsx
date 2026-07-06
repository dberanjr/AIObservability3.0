import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  CloseSidebarIcon,
  OpenSidebarIcon,
  FilterIcon,
  XmarkIcon,
} from "@dynatrace/strato-icons";
import { promptsFocusChip } from "./focus";
import { ErrorBanner } from "../../components/ErrorState";
import { DataGapNote } from "../../components/DataGapNote";
import { PromptQualityAnalytics } from "./PromptQualityAnalytics";
import { PromptsSidebar, type PrivacyMode } from "./PromptsSidebar";
import { PromptsTable, type PromptView } from "./PromptsTable";
import { PromptsTilesRow } from "./PromptsTilesRow";
import { GuardrailsStrip } from "../../guardrails/GuardrailsStrip";
import { usePersistedState } from "../../state/usePersistedState";
import { usePrompts, type PromptsFilter } from "./usePrompts";
import { decodePromptsFilter } from "./findingFilter";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";

export const PromptsPage = () => {
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  // Pulse problem-pattern drill-down (PP-3): the RAW `?focus` id (not the typed
  // useFocusParam union, which only covers architecture-layer keys). A known id
  // applies that pattern's predicate to the list; unknown/absent is a no-op.
  const focus = new URLSearchParams(search).get("focus");
  // Chip label for ANY known focus — same-span (PP-3) OR cross-span (PP-4).
  // `approximate` adds the "≈ approximate" marker where the signal is a proxy.
  const focusChip = promptsFocusChip(focus);
  // Remove the `?focus` param (drops the predicate and the chip), keeping every
  // other search param (timeframe, global filter, sidebar pf_*) intact.
  const clearFocus = useCallback(() => {
    const next = new URLSearchParams(search);
    next.delete("focus");
    const qs = next.toString();
    navigate({ pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [search, pathname, navigate]);
  // Set (or clear, when null) the `?focus` problem-pattern from the sidebar —
  // the SAME mechanism the Pulse drill-down and the "Filtered:" chip use, so the
  // chip and the sidebar selection stay in sync via the URL.
  const setFocus = useCallback(
    (id: string | null) => {
      if (!id) return clearFocus();
      const next = new URLSearchParams(search);
      next.set("focus", id);
      navigate({ pathname, search: `?${next.toString()}` }, { replace: true });
    },
    [search, pathname, navigate, clearFocus],
  );
  const [filter, setFilter] = useState<PromptsFilter>(() =>
    decodePromptsFilter(typeof window !== "undefined" ? window.location.search : ""),
  );
  // A finding drill arrives with a `pf_*` filter in the URL — apply it (once per
  // distinct filter) on top of whatever the user has, so the stream pre-scopes
  // to the spans that contributed to that problem pattern.
  const appliedFilterRef = useRef<string>("");
  useEffect(() => {
    const incoming = decodePromptsFilter(search);
    const sig = JSON.stringify(incoming);
    if (sig !== "{}" && sig !== appliedFilterRef.current) {
      appliedFilterRef.current = sig;
      setFilter((prev) => ({ ...prev, ...incoming }));
    }
  }, [search]);
  // The shared toolbar's global Reset must also clear the Prompts left sidebar
  // filter (services/agents/models/onlyErrors/…), which lives in this local
  // state — mirrors Explorer's reset-handler registration. Also clear the
  // applied-filter ref so a still-present `pf_*` URL param doesn't immediately
  // re-apply on the next render.
  const { registerResetHandler } = useGlobalFilters();
  // Keep the latest clearFocus in a ref so the once-registered reset handler
  // always clears the CURRENT `?focus` (avoids a stale-closure that would clear
  // an old search string).
  const clearFocusRef = useRef(clearFocus);
  clearFocusRef.current = clearFocus;
  useEffect(
    () =>
      registerResetHandler(() => {
        appliedFilterRef.current = "";
        setFilter({});
        clearFocusRef.current();
      }),
    [registerResetHandler],
  );
  const [view, setView] = useState<PromptView>("stream");
  // Sticky sidebar height must equal the space from its (pinned) top to the
  // viewport bottom — a fixed calc() guesses the page-header height wrong and
  // pushes the bottom (Privacy) off-screen, unreachable by the inner scroll.
  // Measure it from the element's actual top instead, on mount/scroll/resize.
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarMaxH, setSidebarMaxH] = useState<number | undefined>(undefined);
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = sidebarRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        setSidebarMaxH(Math.max(220, window.innerHeight - top - 24));
      });
    };
    compute();
    window.addEventListener("resize", compute);
    // capture:true so the inner Page.Main scroll container's events are caught.
    window.addEventListener("scroll", compute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState<boolean>(
    "ai-obs.prompts-sidebar-collapsed",
    false,
  );
  const [privacy, setPrivacy] = usePersistedState<PrivacyMode>(
    "ai-obs.prompts-privacy",
    "mask",
  );

  const {
    prompts,
    filtered,
    facets,
    isLoading,
    error: promptsError,
    refetch,
    hasContent,
    hasEval,
  } = usePrompts(filter, focus);

  const firstError = promptsError ?? null;

  // Only warn once data has loaded and genuinely lacks content/eval, so the
  // notice self-hides for properly instrumented tenants.
  const showMetadataNotice =
    !isLoading && prompts.length > 0 && (!hasContent || !hasEval);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: sidebarCollapsed
          ? "36px minmax(0, 1fr)"
          : "248px minmax(0, 1fr)",
        gap: 16,
        padding: "18px 20px 80px",
        alignItems: "start",
      }}
    >
      {/* Sticky so the filters stay in view while the prompt list scrolls; it
          scrolls internally when taller than the viewport. The sidebar content
          is fluid-width and we reserve gutter space (scrollbar-gutter +
          paddingRight) so the scrollbar never overlaps the right-aligned facet
          counts (the bug that hid the totals before). Collapsible to reclaim
          horizontal space for the table. */}
      <div
        ref={sidebarRef}
        style={{
          position: "sticky",
          top: 16,
          alignSelf: "start",
          maxHeight: sidebarMaxH ? `${sidebarMaxH}px` : "calc(100vh - 160px)",
          overflowY: sidebarCollapsed ? "visible" : "auto",
          paddingRight: sidebarCollapsed ? 0 : 8,
          scrollbarGutter: sidebarCollapsed ? "auto" : "stable",
        }}
      >
        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            title="Show filters"
            aria-label="Show filters"
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "10px 0",
              width: 36,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-2)",
            }}
          >
            <OpenSidebarIcon size={16} />
            <FilterIcon size={16} />
          </button>
        ) : (
          <>
            <Flex justifyContent="flex-end" style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="Hide filters"
                aria-label="Hide filters"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 4,
                  borderRadius: 6,
                  color: "var(--text-3)",
                }}
              >
                <CloseSidebarIcon size={16} />
              </button>
            </Flex>
            <PromptsSidebar
              facets={facets}
              filter={filter}
              privacy={privacy}
              focus={focus}
              onFilterChange={setFilter}
              onPrivacyChange={setPrivacy}
              onFocusChange={setFocus}
            />
          </>
        )}
      </div>

      <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
        {firstError && <ErrorBanner error={firstError} />}
        {focusChip && (
          <Flex alignItems="center" gap={8}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 6,
                background:
                  "var(--blue-surface, color-mix(in oklab, var(--blue) 12%, transparent))",
                border: "1px solid color-mix(in oklab, var(--blue) 35%, transparent)",
                fontSize: 11.5,
                color: "var(--text)",
                whiteSpace: "nowrap",
                maxWidth: 420,
              }}
            >
              <span style={{ color: "var(--text-2)" }}>Filtered:</span>
              <span style={{ fontWeight: 600 }}>{focusChip.label}</span>
              {focusChip.approximate && (
                <span
                  title="Approximate: the pattern's exact signal isn't emitted on this tenant, so the closest defensible proxy is used."
                  style={{
                    color: "var(--text-3)",
                    fontStyle: "italic",
                    cursor: "help",
                  }}
                >
                  ≈ approximate
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${focusChip.label} filter`}
                title="Clear filter"
                onClick={clearFocus}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  color: "var(--text-3)",
                }}
              >
                <XmarkIcon size={12} />
              </button>
            </span>
          </Flex>
        )}
        {showMetadataNotice && (
          <Flex
            alignItems="flex-start"
            gap={8}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "color-mix(in oklab, var(--amber) 10%, var(--surface))",
              border: "1px solid color-mix(in oklab, var(--amber) 40%, transparent)",
            }}
          >
            <Text style={{ fontSize: 11.5, color: "var(--text)" }}>
              <strong>Metadata-only.</strong> This environment doesn't instrument
              {!hasContent && (
                <>
                  {" "}prompt/response content (<code>gen_ai.prompt.*</code> /{" "}
                  <code>gen_ai.completion.*</code>)
                </>
              )}
              {!hasContent && !hasEval ? " or" : ""}
              {!hasEval && (
                <>
                  {" "}evaluation scores (<code>gen_ai.evaluation.*</code>)
                </>
              )}
              , so the table shows LLM-call metadata (model, tokens, latency,
              agent) and the masking / quality-analytics panels stay inert until
              those attributes are emitted.
            </Text>
          </Flex>
        )}
        {/* Guardrails gate the prompt/response I/O analyzed below — surface the
            fleet intervention context (Bedrock metrics; full view on Pulse). */}
        <GuardrailsStrip />
        <PromptsTilesRow
          filter={filter}
          onFilterChange={setFilter}
        />
        <DataGapNote
          tone="warn"
          message="Multi-turn conversation grouping is unavailable and prompts often resolve to a single app/agent: no conversation id is emitted, and prompt content is captured on only a small share of spans. Prompts also can't be attributed to an agent because gen_ai.agent.name isn't set on LLM spans."
          attributes={["gen_ai.conversation.id", "gen_ai.prompt.0.content (sparse)", "gen_ai.agent.name (on LLM spans)"]}
          bestPractice="Emit a stable gen_ai.conversation.id per dialogue, raise prompt/response content capture coverage (behind privacy controls), and propagate trace context / agent name to LLM spans. See INSTRUMENTATION-REQUIREMENTS.md P1.1 and P2.6."
          href="https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/"
          hrefLabel="OTel GenAI spans"
        />
        <PromptQualityAnalytics />

        <PromptsTable
          view={view}
          onViewChange={setView}
          prompts={filtered}
          isLoading={isLoading}
          privacy={privacy}
          onRefresh={refetch}
        />
      </Flex>
    </div>
  );
};

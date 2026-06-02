import React, { useState, useRef, useEffect } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  CloseSidebarIcon,
  OpenSidebarIcon,
  FilterIcon,
} from "@dynatrace/strato-icons";
import { ErrorBanner } from "../../components/ErrorState";
import { PromptQualityAnalytics } from "./PromptQualityAnalytics";
import { PromptsSidebar, type PrivacyMode } from "./PromptsSidebar";
import { PromptsTable, type PromptView } from "./PromptsTable";
import { PromptsTilesRow } from "./PromptsTilesRow";
import { usePersistedState } from "../../state/usePersistedState";
import { usePrompts, type PromptsFilter } from "./usePrompts";
import { usePromptQuality } from "./usePromptQuality";
import { usePromptSummary } from "./usePromptSummary";

export const PromptsPage = () => {
  const [filter, setFilter] = useState<PromptsFilter>({});
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

  const summary = usePromptSummary();
  const quality = usePromptQuality();
  const {
    prompts,
    filtered,
    facets,
    isLoading,
    error: promptsError,
    refetch,
    hasContent,
    hasEval,
  } = usePrompts(filter);

  const firstError =
    summary.error ?? quality.error ?? promptsError ?? null;

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
              onFilterChange={setFilter}
              onPrivacyChange={setPrivacy}
            />
          </>
        )}
      </div>

      <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
        {firstError && <ErrorBanner error={firstError} />}
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
        <PromptsTilesRow
          summary={summary}
          filter={filter}
          onFilterChange={setFilter}
        />
        <PromptQualityAnalytics quality={quality} />

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

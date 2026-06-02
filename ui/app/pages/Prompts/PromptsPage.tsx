import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
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
        gridTemplateColumns: "230px minmax(0, 1fr)",
        gap: 16,
        padding: "18px 20px 80px",
        alignItems: "start",
      }}
    >
      <PromptsSidebar
        facets={facets}
        filter={filter}
        privacy={privacy}
        onFilterChange={setFilter}
        onPrivacyChange={setPrivacy}
      />

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
        <PromptsTilesRow summary={summary} />
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

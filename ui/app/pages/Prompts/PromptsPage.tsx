import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
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
  const { filtered, facets, isLoading, error: promptsError, refetch } =
    usePrompts(filter);

  const firstError =
    summary.error ?? quality.error ?? promptsError ?? null;

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

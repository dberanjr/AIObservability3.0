import React, { useEffect, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { PromptDetailPanel } from "./PromptDetailPanel";
import { PromptQualityAnalytics } from "./PromptQualityAnalytics";
import { PromptsSidebar, type PrivacyMode } from "./PromptsSidebar";
import { PromptsTable, type PromptView } from "./PromptsTable";
import { PromptsTilesRow } from "./PromptsTilesRow";
import { usePersistedState } from "../../state/usePersistedState";
import { usePrompts, type PromptRow, type PromptsFilter } from "./usePrompts";
import { usePromptQuality } from "./usePromptQuality";
import { usePromptSummary } from "./usePromptSummary";

export const PromptsPage = () => {
  const [filter, setFilter] = useState<PromptsFilter>({});
  const [view, setView] = useState<PromptView>("stream");
  const [privacy, setPrivacy] = usePersistedState<PrivacyMode>(
    "ai-obs.prompts-privacy",
    "mask",
  );
  const [selected, setSelected] = useState<PromptRow | null>(null);

  const summary = usePromptSummary();
  const quality = usePromptQuality();
  const { filtered, facets, isLoading, error: promptsError } = usePrompts(filter);

  // Escape key closes the open detail panel.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

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

        <PromptsTable
          view={view}
          onViewChange={setView}
          prompts={filtered}
          isLoading={isLoading}
          privacy={privacy}
          onRowClick={(p) =>
            setSelected((current) => (current?.id === p.id ? null : p))
          }
        />

        {selected && (
          <PromptDetailPanel
            prompt={selected}
            privacy={privacy}
            onClose={() => setSelected(null)}
          />
        )}

        <PromptQualityAnalytics quality={quality} />
      </Flex>
    </div>
  );
};

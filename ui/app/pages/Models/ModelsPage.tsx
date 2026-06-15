import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { DataGapNote } from "../../components/DataGapNote";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import type { Finding } from "../../components/drawers/types";
import { ModelBubbleChart } from "./ModelBubbleChart";
import { ModelsFindings } from "./ModelsFindings";
import { ModelsSidePanels } from "./ModelsSidePanels";
import { ModelsTable } from "./ModelsTable";
import { ModelsTilesRow } from "./ModelsTilesRow";
import {
  ModelTypeSegmented,
  type ModelTypeFilter,
} from "./ModelTypeSegmented";
import { ModelsFinOpsSections } from "./ModelsFinOpsSections";
import { useModels } from "./useModels";

export const ModelsPage = () => {
  const { models, isLoading, error } = useModels();
  const [typeFilter, setTypeFilter] = useState<ModelTypeFilter>("all");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  const counts = useMemo(
    () => ({
      all: models.length,
      generative: models.filter((m) => m.type === "generative").length,
      embedding: models.filter((m) => m.type === "embedding").length,
      reranking: models.filter((m) => m.type === "reranking").length,
    }),
    [models],
  );

  const filtered = useMemo(
    () =>
      typeFilter === "all"
        ? models
        : models.filter((m) => m.type === typeFilter),
    [models, typeFilter],
  );

  return (
    <>
      <Flex
        flexDirection="column"
        gap={16}
        style={{ padding: "18px 20px 80px" }}
      >
        {error && <ErrorBanner error={error} />}
        <ModelTypeSegmented
          value={typeFilter}
          counts={counts}
          onChange={setTypeFilter}
        />
        <ModelsTilesRow models={filtered} isLoading={isLoading} />
        <DataGapNote
          message="Quality columns (eval score, faithfulness, hallucination) and 'cheapest model meeting a quality SLO' aren't shown: no evaluation scores are emitted, so models can only be compared on cost and latency today."
          attributes={["gen_ai.evaluation.score", "gen_ai.evaluation.faithfulness", "gen_ai.evaluation.hallucination"]}
          bestPractice="Run an eval step (LLM-as-judge / Ragas / DeepEval) and write gen_ai.evaluation.* back onto the LLM span. Then quality-per-dollar and quality A/B across model versions become directly queryable. See INSTRUMENTATION-REQUIREMENTS.md P1.2."
          href="https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/"
          hrefLabel="OTel GenAI"
        />
        <ModelsFindings models={filtered} onSelect={setSelectedFinding} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <ModelBubbleChart models={filtered} isLoading={isLoading} />
          <ModelsSidePanels models={filtered} isLoading={isLoading} />
        </div>
        <ModelsTable models={filtered} isLoading={isLoading} />
        {/* FinOps merged in as collapsible sections below the bubble chart +
            table. Cost figures flow through the section-G cost model. */}
        <ModelsFinOpsSections models={models} onSelectFinding={setSelectedFinding} />
      </Flex>
      <FindingDrawer
        finding={selectedFinding}
        onDismiss={() => setSelectedFinding(null)}
      />
    </>
  );
};

/**
 * RAG / vector-database panel (Explorer). Auto-rendered by CapabilityGate when
 * the tenant emits db.system / vector_db.* attributes.
 */

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MiniStat } from "../../components/MiniStat";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ErrorState } from "../../components/ErrorState";
import { fmtCount } from "../../data/format";
import { useRag } from "./useRag";

// Body is a separate component so useRag (self-fetching DQL) only runs while
// the section is expanded — collapsing unmounts the body and issues no query.
const RagPanelBody = () => {
  const r = useRag();

  const items: BarListItem[] = r.stores.map((s) => ({
    key: s.system,
    label: s.system,
    value: s.queries,
    displayValue: fmtCount(s.queries),
    secondary: s.avgTopK > 0 ? `avg top-k ${s.avgTopK.toFixed(1)}` : undefined,
    filter: { attribute: "db.system", values: [s.system], label: "vector store" },
  }));

  return (
    <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
      {r.isLoading ? (
        <Skeleton style={{ height: 84, borderRadius: 6 }} />
      ) : r.error ? (
        <ErrorState
          title="Couldn't load retrieval data"
          error={r.error}
          bare
        />
      ) : (
        <Flex flexDirection="column" gap={12}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <MiniStat
              label="Retrievals"
              value={fmtCount(r.totalQueries)}
              color="var(--cyan)"
            />
            <MiniStat label="Vector stores" value={fmtCount(r.storeCount)} />
            <MiniStat
              label="Avg top-k"
              value={r.avgTopK > 0 ? r.avgTopK.toFixed(1) : "—"}
              sub="results requested"
            />
          </div>
          {items.length > 0 && (
            <Flex flexDirection="column" gap={6}>
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                Retrievals by store
              </Text>
              <BarList items={items} color="var(--cyan)" />
            </Flex>
          )}
        </Flex>
      )}
    </Flex>
  );
};

export const RagPanel = () => (
  <CollapsibleCard
    title="Retrieval (RAG)"
    subtitle={
      <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
        From <code>db.system</code> / <code>vector_db.*</code> — surfaced
        because your telemetry now emits retrieval spans.
      </Text>
    }
    defaultOpen
  >
    <RagPanelBody />
  </CollapsibleCard>
);

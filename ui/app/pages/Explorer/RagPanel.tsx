/**
 * RAG / vector-database panel (Explorer). Auto-rendered by CapabilityGate when
 * the tenant emits db.system / vector_db.* attributes.
 */

import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MiniStat } from "../../components/MiniStat";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtCount } from "../../data/format";
import { useRag } from "./useRag";

export const RagPanel = () => {
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
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Retrieval (RAG)
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            From <code>db.system</code> / <code>vector_db.*</code> — surfaced
            because your telemetry now emits retrieval spans.
          </Text>
        </Flex>

        {r.isLoading ? (
          <Skeleton style={{ height: 84, borderRadius: 6 }} />
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
    </Surface>
  );
};

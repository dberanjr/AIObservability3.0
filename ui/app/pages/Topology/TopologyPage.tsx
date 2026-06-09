import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { TextInput } from "@dynatrace/strato-components/forms";
import { Skeleton } from "@dynatrace/strato-components/content";
import { NetworkIcon } from "@dynatrace/strato-icons";
import { ErrorBanner } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { DataGapNote } from "../../components/DataGapNote";
import { tenantLabel } from "../../lib/tenant";
import {
  useAggregateTopology,
  TIER_ORDER,
  TIER_LABEL,
  TIER_COLOR,
  type AggNode,
  type AggTier,
} from "./useAggregateTopology";
import { AggregateTopologyGraph, type LayoutMode } from "./AggregateTopologyGraph";
import { TopologyNodePanel } from "./TopologyNodePanel";

const LAYOUTS: { id: LayoutMode; label: string }[] = [
  { id: "force", label: "Force" },
  { id: "vertical", label: "Vertical" },
  { id: "horizontal", label: "Horizontal" },
];

export const TopologyPage = () => {
  const topo = useAggregateTopology();
  const [layout, setLayout] = useState<LayoutMode>("force");
  const [search, setSearch] = useState("");
  const [hiddenTiers, setHiddenTiers] = useState<Set<AggTier>>(() => new Set());
  const [selected, setSelected] = useState<AggNode | null>(null);
  const [isolateId, setIsolateId] = useState<string | null>(null);

  const toggleTier = (t: AggTier) =>
    setHiddenTiers((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const presentTiers = useMemo(
    () => TIER_ORDER.filter((t) => topo.tierCounts[t]?.total > 0),
    [topo.tierCounts],
  );

  return (
    <div style={{ padding: "18px 20px 80px" }}>
      <Flex flexDirection="column" gap={12} style={{ minWidth: 0 }}>
        <Flex flexDirection="column" gap={2}>
          <Flex alignItems="center" gap={8}>
            <NetworkIcon size={20} style={{ color: "var(--blue)" }} />
            <Heading level={1} style={{ fontSize: 20, fontWeight: 600 }}>
              Topology
            </Heading>
          </Flex>
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
            {tenantLabel()} · aggregate of all AI calls in the window · honors filters &amp; segments
          </Text>
        </Flex>

        {topo.error && <ErrorBanner error={topo.error} />}

        {topo.isEmpty && !topo.error ? (
          <EmptyState
            title="No AI topology in this window"
            description="No gen_ai spans were found for the active timeframe, segments, and filters. Try widening the timeframe or clearing filters."
            icon={<NetworkIcon size={28} />}
          />
        ) : (
          <>
            {/* Control bar */}
            <Surface elevation="raised" padding={12}>
              <Flex justifyContent="space-between" alignItems="center" gap={12} style={{ flexWrap: "wrap" }}>
                <Flex alignItems="center" gap={6}>
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLayout(l.id)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: "4px 12px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: layout === l.id ? 700 : 500,
                        color: layout === l.id ? "#fff" : "var(--text-2)",
                        background: layout === l.id ? "var(--blue)" : "var(--surface-3)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {l.label}
                    </button>
                  ))}
                </Flex>
                <div style={{ width: 280, maxWidth: "50vw" }}>
                  <TextInput
                    name="topology-search"
                    value={search}
                    onChange={setSearch}
                    placeholder="Find nodes by name…"
                  />
                </div>
              </Flex>

              {/* Legend / tier toggles */}
              <Flex gap={8} style={{ flexWrap: "wrap", marginTop: 10 }}>
                {presentTiers.map((t) => {
                  const c = topo.tierCounts[t];
                  const hidden = hiddenTiers.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTier(t)}
                      title={hidden ? "Show" : "Hide"}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 9px",
                        borderRadius: 999,
                        fontSize: 11,
                        opacity: hidden ? 0.4 : 1,
                        background: "var(--surface-3)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: TIER_COLOR[t] }} />
                      <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{TIER_LABEL[t]}</span>
                      <span style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                        {c.shown < c.total ? `${c.shown}/${c.total}` : c.total}
                      </span>
                    </button>
                  );
                })}
              </Flex>
            </Surface>

            {topo.isLoading && topo.nodes.length === 0 ? (
              <Skeleton style={{ height: 680, borderRadius: 10 }} />
            ) : (
              <div className="aiobs-topology-resize" title="Drag the bottom edge to resize">
                <AggregateTopologyGraph
                  nodes={topo.nodes}
                  edges={topo.edges}
                  maxCalls={topo.maxCalls}
                  layout={layout}
                  search={search}
                  hiddenTiers={hiddenTiers}
                  onSelectNode={setSelected}
                  selectedId={selected?.id ?? null}
                  isolateId={isolateId}
                  affectedNodeIds={topo.affectedNodeIds}
                />
              </div>
            )}

            {/* Selected-node detail panel: RED metrics, volume/latency chart, actions. */}
            {selected && (
              <TopologyNodePanel
                node={selected}
                isolated={isolateId === selected.id}
                onIsolate={() => setIsolateId((cur) => (cur === selected.id ? null : selected.id))}
                onClose={() => {
                  setSelected(null);
                  setIsolateId(null);
                }}
              />
            )}

            <DataGapNote
              message="Upstream/downstream come from Smartscape service dependencies; the AI core (agents, models, providers, tools) from gen_ai spans. Node click filters all pages today; rich per-node charts, vector-DB nodes, problem status, and Smartscape drill-in are coming next."
              attributes={["gen_ai.tool.name", "vector_db.*", "mcp.server.name"]}
              bestPractice="Richer downstream (vector DB, MCP servers) and exact tool nodes need gen_ai.tool.* / mcp.* / vector_db.* on spans, plus trace-context propagation so LLM proxy spans join their agent. See INSTRUMENTATION-REQUIREMENTS.md."
              href="https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/"
              hrefLabel="OTel GenAI"
            />
          </>
        )}
      </Flex>
    </div>
  );
};

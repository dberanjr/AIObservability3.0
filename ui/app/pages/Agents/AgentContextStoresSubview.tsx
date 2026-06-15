/**
 * Per-agent "Context stores" sub-view: retrieval (RAG) and memory/state-store
 * behaviour as siblings (redesign D.3). Each half is capability-gated
 * independently — the RAG half on a real vector store (vectorDb), the memory
 * half on state-store spans (memoryStore). If neither is present, a single
 * EmptyState explains what instrumentation would light it up.
 *
 * Reuses the existing RAG detection (useRag); no new vector-store DQL. RAG is
 * shown fleet-wide because retrieval spans aren't attributed to a single agent
 * in the current instrumentation — noted inline.
 */
import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useCapability } from "../../scope/CapabilityContext";
import { useRag } from "../Explorer/useRag";
import { EmptyState } from "../../components/EmptyState";
import { fmtCount } from "../../data/format";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-3)",
    }}
  >
    {children}
  </Text>
);

const RagHalf = () => {
  const rag = useRag();
  if (rag.isLoading) return null;
  if (rag.stores.length === 0)
    return (
      <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        No vector-store retrieval in the current scope.
      </Text>
    );
  return (
    <Flex flexDirection="column" gap={6}>
      <Text style={{ fontSize: 12.5 }}>
        {fmtCount(rag.totalQueries)} retrievals across {rag.storeCount}{" "}
        {rag.storeCount === 1 ? "store" : "stores"} · avg top-k{" "}
        {rag.avgTopK.toFixed(1)}
      </Text>
      {rag.stores.map((s) => (
        <Text key={s.system} style={{ fontSize: 12, color: "var(--text-2)" }}>
          {s.system}: {fmtCount(s.queries)} queries · top-k{" "}
          {s.avgTopK.toFixed(1)}
        </Text>
      ))}
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Shown fleet-wide — retrieval spans aren't attributed to a single agent
        in the current instrumentation.
      </Text>
    </Flex>
  );
};

export const AgentContextStoresSubview = () => {
  const cap = useCapability();
  const ragStatus = cap.status("vectorDb");
  const memStatus = cap.status("memoryStore");

  if (ragStatus !== "present" && memStatus !== "present") {
    return (
      <EmptyState
        bare
        title="No context stores detected"
        description="This agent shows no retrieval (RAG) or memory/state-store activity in the current scope."
        hint="Emit a dedicated vector store as db.system (e.g. pinecone/qdrant) or vector_db.* attributes for RAG, and conversation/thread identifiers (gen_ai.conversation.id / langgraph thread) for memory, to light these up."
      />
    );
  }

  return (
    <Flex flexDirection="column" gap={16}>
      <Surface>
        <Flex flexDirection="column" gap={8} style={{ padding: 12 }}>
          <SectionLabel>Retrieval (RAG)</SectionLabel>
          {ragStatus === "present" ? (
            <RagHalf />
          ) : (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              No vector store detected. Emit a vector db.system value or
              vector_db.* attributes to enable retrieval analysis.
            </Text>
          )}
        </Flex>
      </Surface>
      <Surface>
        <Flex flexDirection="column" gap={8} style={{ padding: 12 }}>
          <SectionLabel>Memory / state store</SectionLabel>
          {memStatus === "present" ? (
            <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
              State-store spans detected — per-agent memory retrieval latency and
              history-growth analysis will render here.
            </Text>
          ) : (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              No memory/state-store spans. Emit conversation/thread identifiers
              (gen_ai.conversation.id or a langgraph checkpoint/thread) to enable
              memory analysis.
            </Text>
          )}
        </Flex>
      </Surface>
    </Flex>
  );
};

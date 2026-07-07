/**
 * Near-full-screen modal for the Pulse arch-map Client node: golden signals
 * for every monitored upstream caller, a top-8 P90-over-time chart, and a
 * fresh 3-column caller→AI-service→component flow map. Fetches its own data
 * via useUpstreamDetail and owns a single `selectedId` that spotlights the
 * chosen caller across the table, chart, and flow map at once.
 *
 * Fidelity is topology-level throughout — no per-request/per-trace
 * attribution, no per-caller cost column (see memory/redesign-decisions.md
 * and the plan's Global Constraints).
 */
import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useModalA11y } from "../../../components/useModalA11y";
import { PanelSkeleton } from "../../../components/PanelSkeleton";
import { ErrorState } from "../../../components/ErrorState";
import { EmptyState, emptyCause } from "../../../components/EmptyState";
import { useUpstreamDetail } from "./useUpstreamDetail";
import { UpstreamGoldenSignalsTable } from "./UpstreamGoldenSignalsTable";
import { UpstreamP90Chart } from "./UpstreamP90Chart";
import { UpstreamFlowMap } from "./UpstreamFlowMap";

export interface UpstreamServicesModalProps {
  open: boolean;
  onClose: () => void;
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 16,
  background: "var(--surface-2, var(--surface))",
};

/**
 * Renders nothing when closed. Otherwise a fixed scrim + centered ~92vw×90vh
 * dialog holding the golden-signals table, the P90 chart, and the flow map —
 * each a separate card, all sharing the modal's `selectedId` spotlight.
 */
export const UpstreamServicesModal = ({
  open,
  onClose,
}: UpstreamServicesModalProps) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useModalA11y(dialogRef, onClose, {
    initialFocusRef: closeBtnRef,
    active: open,
  });

  const d = useUpstreamDetail(open);

  if (!open) return null;

  const callerCount = d.graph.callers.length;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Upstream services"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 10, 11, 0.55)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "92vw",
          height: "90vh",
          maxWidth: "92vw",
          maxHeight: "90vh",
          background: "var(--surface)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflow: "auto",
        }}
      >
        <Flex alignItems="flex-start" justifyContent="space-between" gap={16}>
          <Flex flexDirection="column" gap={2}>
            <Heading level={2} style={{ fontSize: 18, fontWeight: 700 }}>
              Upstream services{" "}
              {!d.isLoading && !d.error && (
                <span style={{ color: "var(--text-3)", fontWeight: 500 }}>
                  · {callerCount} caller{callerCount === 1 ? "" : "s"}
                </span>
              )}
            </Heading>
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              Every monitored service that calls into the in-scope AI
              footprint, and what each one reaches.
            </Text>
          </Flex>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              fontSize: 18,
              lineHeight: 1,
              color: "var(--text-3)",
            }}
          >
            ×
          </button>
        </Flex>

        {d.isLoading ? (
          <div style={cardStyle}>
            <PanelSkeleton height={280} lines={5} />
          </div>
        ) : d.error ? (
          <div style={cardStyle}>
            <ErrorState bare error={d.error} title="Couldn't load upstream services" />
          </div>
        ) : callerCount === 0 ? (
          <div style={cardStyle}>
            <EmptyState
              bare
              cause={emptyCause({ error: d.error, limitHit: d.limitHit })}
              title="No upstream callers in scope"
            />
          </div>
        ) : (
          <>
            <div style={cardStyle}>
              <UpstreamGoldenSignalsTable
                callers={d.graph.callers}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <div style={cardStyle}>
              <UpstreamP90Chart
                callers={d.graph.callers}
                p90Series={d.p90Series}
                labels={d.labels}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <div style={cardStyle}>
              <UpstreamFlowMap
                graph={d.graph}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

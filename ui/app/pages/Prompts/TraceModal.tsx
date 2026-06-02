import React, { useState } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextInput } from "@dynatrace/strato-components/forms";
import { ExternalLinkIcon, MagnifyingGlassIcon } from "@dynatrace/strato-icons";
import { TraceTree } from "./TraceTree";
import type { TraceSpan } from "./useTraceSpans";
import { openInTraces, type IntentContext } from "../../lib/intents";

export interface TraceModalProps {
  show: boolean;
  onClose: () => void;
  ctx: IntentContext;
  spans: TraceSpan[];
  isLoading: boolean;
}

/**
 * Full-trace waterfall in a modal, keeping the AI Observability app in focus.
 *
 * The Distributed Tracing app can't be embedded in an <iframe> (platform CSP
 * blocks framing — "This content is blocked"), so we render our own waterfall
 * from the spans we already fetched. The header button opens the same trace
 * full-screen in the Distributed Tracing app via its `view-traces` intent.
 */
export const TraceModal = ({
  show,
  onClose,
  ctx,
  spans,
  isLoading,
}: TraceModalProps) => {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const openFull = () => openInTraces(ctx);

  return (
    <Modal
      show={show}
      onDismiss={onClose}
      size="large"
      title="Distributed trace"
      footer={
        <Flex justifyContent="space-between" alignItems="center" gap={8}>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            Trace {ctx.traceId ?? "—"}
          </Text>
          <Flex gap={8}>
            <Button onClick={onClose}>Close</Button>
            <Button variant="accent" onClick={openFull} disabled={!ctx.traceId}>
              <Button.Prefix>
                <ExternalLinkIcon />
              </Button.Prefix>
              Open in Distributed Tracing
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="center" gap={6}>
          <MagnifyingGlassIcon
            size={14}
            style={{ color: "var(--text-3)", flex: "0 0 auto" }}
          />
          <div style={{ flex: 1 }}>
            <TextInput
              name="trace-modal-search"
              value={search}
              onChange={setSearch}
              placeholder="Highlight spans by name, service, model, attribute…"
            />
          </div>
        </Flex>
        <TraceTree
          spans={spans}
          isLoading={isLoading}
          highlight={term}
          maxHeight={Math.round(window.innerHeight * 0.5)}
        />
      </Flex>
    </Modal>
  );
};

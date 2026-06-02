import React, { useMemo } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ExternalLinkIcon } from "@dynatrace/strato-icons";
import {
  getTraceIntentLink,
  openInTraces,
  type IntentContext,
} from "../../lib/intents";

export interface TraceModalProps {
  show: boolean;
  onClose: () => void;
  ctx: IntentContext;
}

/**
 * Renders the exact trace inside an embedded Distributed Tracing view in a
 * modal, so the user stays in the AI Observability app. The embed uses the
 * App-Shell intent link (a trace-exemplar `dt.query`) in an <iframe>; a header
 * button opens the same trace full-screen in the Distributed Tracing app.
 *
 * Some platform apps set `frame-ancestors` CSP that blocks embedding. If the
 * iframe can't render (or no link is produced), the "Open in Distributed
 * Tracing" button is always available as the reliable path.
 */
export const TraceModal = ({ show, onClose, ctx }: TraceModalProps) => {
  const link = useMemo(() => (show ? getTraceIntentLink(ctx) : null), [show, ctx]);

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
            Trace {ctx.traceId}
          </Text>
          <Flex gap={8}>
            <Button onClick={onClose}>Close</Button>
            <Button variant="accent" onClick={openFull}>
              <Button.Prefix>
                <ExternalLinkIcon />
              </Button.Prefix>
              Open in Distributed Tracing
            </Button>
          </Flex>
        </Flex>
      }
    >
      {link ? (
        <iframe
          title="Distributed trace"
          src={link}
          style={{
            width: "100%",
            height: "60vh",
            minHeight: 420,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--surface)",
          }}
        />
      ) : (
        <Flex
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={8}
          style={{ height: 280 }}
        >
          <Text style={{ color: "var(--text-3)", fontSize: 13 }}>
            Couldn't embed the trace here.
          </Text>
          <Button variant="accent" onClick={openFull}>
            Open in Distributed Tracing
          </Button>
        </Flex>
      )}
    </Modal>
  );
};

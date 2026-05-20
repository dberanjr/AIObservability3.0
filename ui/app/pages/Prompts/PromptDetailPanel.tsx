import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { WarningIcon } from "@dynatrace/strato-icons";
import { fmtMs, fmtTokens } from "../../data/format";
import type { PromptRow } from "./usePrompts";
import type { PrivacyMode } from "./PromptsSidebar";
import { maskPII } from "./privacy";

const Bubble = ({
  label,
  color,
  text,
}: {
  label: string;
  color: string;
  text: string;
}) => (
  <Flex flexDirection="column" gap={4}>
    <Text
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color,
      }}
    >
      {label}
    </Text>
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: `color-mix(in oklab, ${color} 6%, var(--surface-2))`,
        border: `1px solid color-mix(in oklab, ${color} 25%, var(--border))`,
        fontFamily: "var(--mono, monospace)",
        fontSize: 12,
        color: "var(--text)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text || (
        <Text style={{ color: "var(--text-3)" }}>(empty)</Text>
      )}
    </div>
  </Flex>
);

const PIIBanner = () => (
  <Flex
    alignItems="flex-start"
    gap={8}
    style={{
      padding: "8px 10px",
      borderRadius: 6,
      background: "color-mix(in oklab, var(--amber) 12%, var(--surface))",
      border: "1px solid color-mix(in oklab, var(--amber) 45%, transparent)",
    }}
  >
    <WarningIcon
      size={14}
      style={{ color: "var(--amber)", flex: "0 0 auto", marginTop: 2 }}
    />
    <Text style={{ fontSize: 12, color: "var(--text)" }}>
      <strong>PII detected on this span.</strong> The Privacy segment in the
      sidebar controls whether masked or raw text is displayed.
    </Text>
  </Flex>
);

const TraceTreePlaceholder = ({ prompt }: { prompt: PromptRow }) => (
  <Flex
    flexDirection="column"
    gap={8}
    style={{
      padding: 12,
      borderRadius: 6,
      background: "var(--surface-2)",
      border: "1px dashed var(--border)",
    }}
  >
    <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
      Trace tree · arrives with the Topology session
    </Text>
    <Flex flexDirection="column" gap={4}>
      <Flex alignItems="center" gap={8}>
        <span
          aria-hidden
          style={{
            width: 4,
            height: 16,
            borderRadius: 2,
            background: "var(--blue)",
          }}
        />
        <Text
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 12,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {prompt.kind === "LLM"
            ? `chat.completion (${prompt.model ?? "model"})`
            : `agent.invoke (${prompt.agent ?? "agent"})`}
        </Text>
        <Text
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 11,
            color: "var(--text-3)",
          }}
        >
          {fmtMs(prompt.durationMs)}
        </Text>
      </Flex>
    </Flex>
  </Flex>
);

export interface PromptDetailPanelProps {
  prompt: PromptRow | null;
  privacy: PrivacyMode;
  onClose: () => void;
}

export const PromptDetailPanel = ({
  prompt,
  privacy,
  onClose,
}: PromptDetailPanelProps) => {
  if (!prompt) return null;
  const inputText =
    privacy === "mask" ? maskPII(prompt.promptText) : prompt.promptText;
  const outputText =
    privacy === "mask" ? maskPII(prompt.responseText) : prompt.responseText;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Prompt detail
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {prompt.service} · {prompt.model ?? "model unknown"} ·{" "}
              {fmtMs(prompt.durationMs)} · in {fmtTokens(prompt.inTokens)} / out{" "}
              {fmtTokens(prompt.outTokens)}
            </Text>
          </Flex>
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
        </Flex>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.4fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <Flex flexDirection="column" gap={8}>
            <TraceTreePlaceholder prompt={prompt} />
            <Flex gap={6}>
              <Button variant="default" disabled>
                View trace
              </Button>
              <Button variant="default" disabled>
                User session
              </Button>
            </Flex>
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Intent buttons activate once the Topology session wires{" "}
              <code>sendIntent</code> for Distributed Traces and Sessions.
            </Text>
          </Flex>

          <Flex flexDirection="column" gap={8}>
            {prompt.piiDetected && <PIIBanner />}
            <Bubble label="Input" color="var(--blue)" text={inputText} />
            <Bubble label="Output" color="var(--purple)" text={outputText} />
          </Flex>
        </div>
      </Flex>
    </Surface>
  );
};

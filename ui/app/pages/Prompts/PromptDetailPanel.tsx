import React, { useState, useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextInput } from "@dynatrace/strato-components/forms";
import {
  WarningIcon,
  MagnifyingGlassIcon,
  CopyIcon,
  MaximizeIcon,
} from "@dynatrace/strato-icons";
import { sendIntent } from "@dynatrace-sdk/navigation";
import { fmtMs, fmtTokens } from "../../data/format";
import type { PromptRow } from "./usePrompts";
import type { PrivacyMode } from "./PromptsSidebar";
import { maskPII } from "./privacy";
import { useTraceSpans } from "./useTraceSpans";
import { TRACE_SPANS_LIMIT } from "./queries";
import { useTraceLogs } from "./useTraceLogs";
import { usePromptSpanDetail } from "./usePromptSpanDetail";
import { TraceTree } from "./TraceTree";
import { TraceTopology } from "./TraceTopology";
import { LogsPanel } from "./LogsPanel";
import { TraceModal } from "./TraceModal";
import { openSpanInTraces } from "../../lib/intents";

type DetailTab = "prompts" | "trace" | "logs" | "topology" | "eval" | "info";

/** Copy-to-clipboard button with brief "Copied" feedback. */
const CopyButton = ({
  text,
  label,
  title,
}: {
  text: string;
  label?: string;
  title?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={title ?? "Copy to clipboard"}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: copied ? "var(--green-2)" : "var(--text-3)",
        padding: "2px 4px",
      }}
    >
      <CopyIcon size={13} />
      {label ? <span>{copied ? "Copied" : label}</span> : copied ? <span>Copied</span> : null}
    </button>
  );
};

const Bubble = ({
  label,
  color,
  text,
  maxHeight = 200,
}: {
  label: string;
  color: string;
  text: string;
  maxHeight?: number;
}) => (
  <Flex flexDirection="column" gap={4}>
    <Flex alignItems="center" justifyContent="space-between">
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
      {text ? <CopyButton text={text} title={`Copy ${label.toLowerCase()}`} /> : null}
    </Flex>
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
        maxHeight,
        overflow: "auto",
      }}
    >
      {text || (
        <Text style={{ color: "var(--text-3)" }}>(empty)</Text>
      )}
    </div>
  </Flex>
);

const TabSegmented = ({
  value,
  onChange,
  options,
}: {
  value: DetailTab;
  onChange: (tab: DetailTab) => void;
  options: Array<{ value: DetailTab; label: string }>;
}) => (
  <div
    role="radiogroup"
    style={{
      display: "inline-flex",
      padding: 2,
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 999,
    }}
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="radio"
        aria-checked={opt.value === value}
        onClick={() => onChange(opt.value)}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "4px 12px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: opt.value === value ? 600 : 500,
          color: opt.value === value ? "var(--text)" : "var(--text-2)",
          background: opt.value === value ? "var(--surface)" : "transparent",
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
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

const TruncationNote = ({ truncated }: { truncated: boolean }) =>
  truncated ? (
    <Text style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 8 }}>
      Showing the first {TRACE_SPANS_LIMIT} AI spans of a larger trace — non-AI
      infrastructure spans are filtered out.
    </Text>
  ) : null;

const ScoreCard = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) => (
  <div
    style={{
      padding: 12,
      borderRadius: 6,
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
    }}
  >
    <Text style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-3)" }}>
      {label}
    </Text>
    <Text
      style={{
        fontSize: 20,
        fontWeight: 600,
        color: value === null ? "var(--text-3)" : color,
        marginTop: 4,
      }}
    >
      {value === null ? "—" : value.toFixed(2)}
    </Text>
  </div>
);

export interface PromptDetailPanelProps {
  prompt: PromptRow;
  privacy: PrivacyMode;
  onClose: () => void;
}

export const PromptDetailPanel = ({
  prompt,
  privacy,
  onClose,
}: PromptDetailPanelProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>("prompts");
  const [search, setSearch] = useState("");
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const { spans, isLoading, error, isTruncated } = useTraceSpans(
    prompt.traceId,
    prompt.timestampMs,
  );
  const traceLogs = useTraceLogs(prompt.traceId, prompt.timestampMs);
  const spanDetail = usePromptSpanDetail(prompt.spanId);

  // Log counts shown in the Info tab are derived from the TRACE's logs (same
  // source as the Logs tab). The per-span counts were wrong: WARN/ERROR logs in
  // a trace usually belong to spans other than the LLM-call span, so a span_id
  // match returned 0 even when the trace clearly had error/warning logs.
  const logCounts = useMemo(() => {
    let error = 0;
    let warning = 0;
    let info = 0;
    for (const l of traceLogs.logs) {
      const s = l.status.toUpperCase();
      if (s === "ERROR" || s === "SEVERE" || s === "FATAL") error++;
      else if (s === "WARN" || s === "WARNING") warning++;
      else info++;
    }
    return { error, warning, info };
  }, [traceLogs.logs]);

  const searchTerm = search.trim().toLowerCase();
  const showSearch = activeTab === "trace" || activeTab === "logs";

  const inputText =
    privacy === "mask" ? maskPII(prompt.promptText) : prompt.promptText;
  const outputText =
    privacy === "mask" ? maskPII(prompt.responseText) : prompt.responseText;
  const systemText =
    privacy === "mask" && prompt.systemPrompt
      ? maskPII(prompt.systemPrompt)
      : prompt.systemPrompt;

  // The whole prompt as one copyable block (only sections that exist).
  const wholePrompt = useMemo(() => {
    const parts: string[] = [];
    if (systemText) parts.push(`[System]\n${systemText}`);
    if (inputText) parts.push(`[Input]\n${inputText}`);
    if (outputText) parts.push(`[Output]\n${outputText}`);
    return parts.join("\n\n");
  }, [systemText, inputText, outputText]);

  const sessionId = useMemo(
    () => spans.find((s) => s.sessionId)?.sessionId ?? null,
    [spans],
  );

  const traceCtx = {
    traceId: prompt.traceId ?? undefined,
    spanId: prompt.spanId ?? undefined,
    startMs: prompt.timestampMs,
  };

  const handleUserSession = () => {
    if (sessionId) {
      sendIntent({ "dt.rum.session.id": sessionId });
    }
  };

  return (
    <div style={{ padding: "16px 20px", background: "var(--surface)" }}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="center" justifyContent="space-between">
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Trace details
          </Heading>
          <TabSegmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "prompts", label: "Prompts" },
              { value: "trace", label: "Trace" },
              { value: "logs", label: "Logs" },
              { value: "topology", label: "Topology" },
              { value: "eval", label: "Eval" },
              { value: "info", label: "Info" },
            ]}
          />
        </Flex>

        {showSearch && (
          <Flex alignItems="center" gap={6}>
            <MagnifyingGlassIcon
              size={14}
              style={{ color: "var(--text-3)", flex: "0 0 auto" }}
            />
            <div style={{ flex: 1 }}>
              <TextInput
                name="trace-log-search"
                value={search}
                onChange={setSearch}
                placeholder={
                  activeTab === "trace"
                    ? "Highlight spans by name, service, model, attribute…"
                    : "Filter logs by message or attribute…"
                }
              />
            </div>
          </Flex>
        )}

        {activeTab === "trace" && (
          <Flex flexDirection="column" gap={8}>
            <TruncationNote truncated={isTruncated} />
            <TraceTree
              spans={spans}
              isLoading={isLoading}
              highlight={searchTerm}
              selectedSpanId={selectedSpanId}
              onSelectSpan={setSelectedSpanId}
            />
            {error && (
              <Text style={{ fontSize: 11, color: "var(--red)" }}>
                Error loading trace: {error.message}
              </Text>
            )}
            <Flex gap={6}>
              <Button
                variant="accent"
                onClick={() => setTraceModalOpen(true)}
                disabled={!prompt.traceId}
              >
                Open trace
              </Button>
              <Button
                onClick={() =>
                  openSpanInTraces({
                    traceId: prompt.traceId ?? undefined,
                    spanId: selectedSpanId ?? undefined,
                    startMs: prompt.timestampMs,
                  })
                }
                disabled={!selectedSpanId}
              >
                Open span
              </Button>
              <Button onClick={handleUserSession} disabled={!sessionId}>
                User session
              </Button>
            </Flex>
          </Flex>
        )}

        {activeTab === "logs" && (
          <LogsPanel
            logs={traceLogs.logs}
            isLoading={traceLogs.isLoading}
            highlight={searchTerm}
          />
        )}

        {activeTab === "topology" && (
          <Flex flexDirection="column" gap={8}>
            <TruncationNote truncated={isTruncated} />
            <TraceTopology spans={spans} isLoading={isLoading} />
          </Flex>
        )}

        {activeTab === "prompts" && (
          <Flex flexDirection="column" gap={8}>
            <Flex justifyContent="flex-end" gap={6}>
              <Button
                onClick={() => {
                  navigator.clipboard?.writeText(wholePrompt).catch(() => {});
                }}
                disabled={!wholePrompt}
              >
                <Button.Prefix>
                  <CopyIcon />
                </Button.Prefix>
                Copy all
              </Button>
              <Button
                onClick={() => setPromptModalOpen(true)}
                disabled={!wholePrompt}
              >
                <Button.Prefix>
                  <MaximizeIcon />
                </Button.Prefix>
                Maximize
              </Button>
            </Flex>
            {prompt.piiDetected && <PIIBanner />}
            {systemText && (
              <Bubble label="System" color="var(--text-2)" text={systemText} />
            )}
            <Bubble label="Input" color="var(--blue)" text={inputText} />
            <Bubble label="Output" color="var(--purple)" text={outputText} />
          </Flex>
        )}

        {activeTab === "eval" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <ScoreCard
              label="Hallucination"
              value={prompt.evalHallucination}
              color="var(--red)"
            />
            <ScoreCard
              label="Correctness"
              value={prompt.evalCorrectness}
              color="var(--green)"
            />
            <ScoreCard
              label="Faithfulness"
              value={prompt.evalFaithfulness}
              color="var(--green)"
            />
            <ScoreCard
              label="Relevance"
              value={prompt.evalRelevance}
              color="var(--green)"
            />
          </div>
        )}

        {activeTab === "info" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: 12,
              fontSize: 12,
            }}
          >
            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              Service
            </Text>
            <Text>{prompt.service}</Text>

            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              Model
            </Text>
            <Text>{prompt.model ?? "—"}</Text>

            {prompt.agent && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
                  Agent
                </Text>
                <Text>{prompt.agent}</Text>
              </>
            )}

            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              Duration
            </Text>
            <Text>{fmtMs(prompt.durationMs)}</Text>

            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              In tokens
            </Text>
            <Text>{fmtTokens(prompt.inTokens)}</Text>

            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              Out tokens
            </Text>
            <Text>{fmtTokens(prompt.outTokens)}</Text>

            {prompt.provider && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
                  Provider
                </Text>
                <Text>{prompt.provider}</Text>
              </>
            )}

            {spanDetail.detail?.finishReason && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
                  Finish reason
                </Text>
                <Text>{spanDetail.detail.finishReason}</Text>
              </>
            )}

            {spanDetail.detail?.temperature != null && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
                  Temperature
                </Text>
                <Text>{spanDetail.detail.temperature}</Text>
              </>
            )}

            {spanDetail.detail?.maxTokens != null && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
                  Max tokens
                </Text>
                <Text>{fmtTokens(spanDetail.detail.maxTokens)}</Text>
              </>
            )}

            {spanDetail.detail?.scope && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
                  Instrumentation
                </Text>
                <Text style={{ fontFamily: "var(--mono, monospace)", fontSize: 11 }}>
                  {spanDetail.detail.scope}
                </Text>
              </>
            )}

            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              Logs
            </Text>
            <Text>
              {traceLogs.isLoading ? (
                <Text as="span" style={{ color: "var(--text-3)" }}>
                  loading…
                </Text>
              ) : (
                <>
                  <Text
                    as="span"
                    style={{
                      color: logCounts.error > 0 ? "var(--red)" : "var(--text)",
                    }}
                  >
                    {logCounts.error} error
                  </Text>
                  {" · "}
                  <Text
                    as="span"
                    style={{
                      color:
                        logCounts.warning > 0 ? "var(--amber)" : "var(--text)",
                    }}
                  >
                    {logCounts.warning} warning
                  </Text>
                  {" · "}
                  <Text as="span" style={{ color: "var(--text-3)" }}>
                    {logCounts.info} info
                  </Text>
                </>
              )}
            </Text>

            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              Trace ID
            </Text>
            <Text style={{ fontFamily: "var(--mono, monospace)", fontSize: 11 }}>
              {prompt.traceId ?? "—"}
            </Text>

            {prompt.spanId && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
                  Span ID
                </Text>
                <Text style={{ fontFamily: "var(--mono, monospace)", fontSize: 11 }}>
                  {prompt.spanId}
                </Text>
              </>
            )}

            <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>
              Timestamp
            </Text>
            <Text>{new Date(prompt.timestampMs).toLocaleString()}</Text>

            {prompt.piiDetected && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--amber)" }}>
                  PII Detected
                </Text>
                <Text style={{ color: "var(--amber)" }}>Yes</Text>
              </>
            )}

            {prompt.hasWarning && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--amber)" }}>
                  Warning
                </Text>
                <Text style={{ color: "var(--amber)" }}>Yes</Text>
              </>
            )}

            {prompt.hasError && (
              <>
                <Text style={{ fontWeight: 600, color: "var(--red)" }}>
                  Error
                </Text>
                <Text style={{ color: "var(--red)" }}>Yes</Text>
              </>
            )}
          </div>
        )}
      </Flex>

      <TraceModal
        show={traceModalOpen}
        onClose={() => setTraceModalOpen(false)}
        ctx={traceCtx}
        spans={spans}
        isLoading={isLoading}
      />

      <Modal
        show={promptModalOpen}
        onDismiss={() => setPromptModalOpen(false)}
        size="large"
        title="Prompt"
        footer={
          <Flex justifyContent="flex-end" gap={8}>
            <Button onClick={() => setPromptModalOpen(false)}>Close</Button>
            <Button
              variant="accent"
              onClick={() => {
                navigator.clipboard?.writeText(wholePrompt).catch(() => {});
              }}
            >
              <Button.Prefix>
                <CopyIcon />
              </Button.Prefix>
              Copy all
            </Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={12}>
          {prompt.piiDetected && <PIIBanner />}
          {systemText && (
            <Bubble
              label="System"
              color="var(--text-2)"
              text={systemText}
              maxHeight={Math.round(window.innerHeight * 0.3)}
            />
          )}
          <Bubble
            label="Input"
            color="var(--blue)"
            text={inputText}
            maxHeight={Math.round(window.innerHeight * 0.3)}
          />
          <Bubble
            label="Output"
            color="var(--purple)"
            text={outputText}
            maxHeight={Math.round(window.innerHeight * 0.3)}
          />
        </Flex>
      </Modal>
    </div>
  );
};

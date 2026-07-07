import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import {
  FormatListNumberedIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@dynatrace/strato-icons";

/**
 * Stable in-page anchor (IA-8). The per-page DataGapNote "Full instrumentation
 * checklist →" link routes to /attributes; appending "#instrumentation-checklist"
 * to that link makes this panel auto-expand and scroll into view on arrival.
 * Exported so the anchor is one source of truth rather than a magic string.
 */
export const INSTRUMENTATION_CHECKLIST_ANCHOR = "instrumentation-checklist";

/** Priority band — foundational (P0) → sharpening (P2). */
type Priority = "P0" | "P1" | "P2";

/** One prioritized instrumentation ask. */
export interface ChecklistItem {
  /** Requirement id, e.g. "P0.1". Shown as a small badge. */
  code: string;
  /** Plain-language requirement name (mirrors DataGapNote's REQUIREMENT_NAMES). */
  name: string;
  /** Key attribute path(s) the ask is about, rendered as code chips. */
  attributes: string[];
  /** One-line "what this buys you". */
  unlocks: string;
}

export interface ChecklistTier {
  priority: Priority;
  /** Short band label, e.g. "Foundational". */
  label: string;
  /** Why the whole band matters. */
  blurb: string;
  items: ChecklistItem[];
}

/**
 * The prioritized instrumentation requirements, mirroring the priority / why /
 * best-practice framing of the internal requirements doc. The AI Attribute Audit
 * matrix above is the *live* (present / missing) version; this checklist adds the
 * priority ordering and the capability each ask unblocks, so a user who followed
 * a "Full instrumentation checklist →" gap link lands on a single, human-readable
 * list of what to emit and why.
 */
export const INSTRUMENTATION_CHECKLIST: ChecklistTier[] = [
  {
    priority: "P0",
    label: "Foundational",
    blurb:
      "Blocks multiple whole capability areas — do these first. Nothing downstream (end-to-end traces, per-agent cost, correct error attribution) is reliable until they land.",
    items: [
      {
        code: "P0.1",
        name: "Trace-context propagation across the LLM proxy",
        attributes: ["traceparent", "gen_ai.agent.name", "gen_ai.conversation.id"],
        unlocks:
          "The single highest-leverage fix — end-to-end agentic traces (user → agent → tool → LLM) and per-agent / per-session cost. Propagate W3C traceparent through the proxy so LLM spans stay in the caller's trace instead of starting a new root.",
      },
      {
        code: "P0.2",
        name: "Proxy-span resilience (non-null IDs + Bedrock/boto3 coverage)",
        attributes: ["trace.id", "span.id", "parent.span.id"],
        unlocks:
          "Guarantee non-null trace/span/parent IDs on proxy spans and add a boto3 Bedrock (InvokeModel / Converse) shim so it emits the same gen_ai.* set as the direct SDKs.",
      },
    ],
  },
  {
    priority: "P1",
    label: "High value",
    blurb:
      "Each one unlocks a major capability area the app cannot answer at all today — per-user economics, the quality pillar, tool/MCP analytics, FinOps accuracy, and perceived latency.",
    items: [
      {
        code: "P1.1",
        name: "Session / user / conversation identity",
        attributes: ["session.id", "gen_ai.conversation.id", "gen_ai.user", "dt.rum.session.id"],
        unlocks:
          "Cost & quality per session / user / team, multi-turn conversation reconstruction, and front-end-to-back-end (RUM) linkage.",
      },
      {
        code: "P1.2",
        name: "Evaluation / quality scores",
        attributes: ["gen_ai.evaluation.name", "gen_ai.evaluation.score.value"],
        unlocks:
          "The entire Quality pillar — quality dashboards & SLOs, drift detection after a prompt/model change, and A/B quality across model versions.",
      },
      {
        code: "P1.3",
        name: "Tool & MCP semantic attributes",
        attributes: ["gen_ai.tool.name", "gen_ai.tool.call.id", "mcp.method.name", "mcp.server.name"],
        unlocks:
          "Per-tool success / error rate, malformed-argument rate, and MCP method / session / server analytics instead of inferring tool health from generic Traceloop spans.",
      },
      {
        code: "P1.4",
        name: "Cost & token completeness",
        attributes: [
          "gen_ai.usage.cost",
          "gen_ai.usage.cached_tokens",
          "gen_ai.usage.reasoning.output_tokens",
        ],
        unlocks:
          "FinOps accuracy — provider-returned cost, plus cache savings and reasoning-token spend, become visible rather than derived or invisible.",
      },
      {
        code: "P1.5",
        name: "Time-to-first-token & latency split",
        attributes: ["gen_ai.response.ttft", "gen_ai.response.time_to_first_chunk"],
        unlocks:
          "Perceived streaming performance — emit TTFT on streamed responses and record client vs server durations so queue / cold-start latency is separable from generation.",
      },
    ],
  },
  {
    priority: "P2",
    label: "Completes / sharpens",
    blurb:
      "Valuable additions that complete or sharpen an area once the P0/P1 foundation is in place.",
    items: [
      {
        code: "P2.1",
        name: "Retrieval / vector-DB attributes",
        attributes: ["gen_ai.retrieval.query.text", "gen_ai.retrieval.top_k", "gen_ai.retrieval.documents"],
        unlocks:
          "RAG retrieval precision / recall, retrieved-doc capture, and context-bottleneck analysis.",
      },
      {
        code: "P2.2",
        name: "Privacy & guardrail attributes",
        attributes: ["gen_ai.privacy.pii_detected", "gen_ai.request.guardrail_id"],
        unlocks:
          "Security / governance — PII exposure and guardrail / jailbreak block-rate visibility.",
      },
      {
        code: "P2.3",
        name: "Error-taxonomy attributes",
        attributes: ["exception.type", "gen_ai.error.code", "gen_ai.error.message"],
        unlocks:
          "Distinguish provider vs orchestration vs input errors instead of a single opaque failure.",
      },
      {
        code: "P2.4",
        name: "Agent loop counters & framework tag",
        attributes: ["gen_ai.agent.iteration", "gen_ai.agent.max_iterations", "gen_ai.framework"],
        unlocks:
          "Runaway-loop / non-termination detection and framework attribution.",
      },
      {
        code: "P2.5",
        name: "Retry / throttle signals",
        attributes: ["gen_ai.request.retry_count", "http.response.status_code"],
        unlocks:
          "Explain retry / throttle latency inflation — record retry count and surface HTTP 429s explicitly.",
      },
      {
        code: "P2.6",
        name: "Structured prompt / response messages",
        attributes: ["gen_ai.input.messages", "gen_ai.output.messages"],
        unlocks:
          "Prompt analytics, replay, and prompt-injection detection — capture structured messages (roles preserved) behind a privacy control.",
      },
      {
        code: "P2.7",
        name: "Business-outcome linkage",
        attributes: ["bizevents"],
        unlocks:
          "ROI / value-per-dollar — tie a conversation or agent run to a business outcome (booking made, ticket resolved).",
      },
    ],
  },
];

const PRIORITY_META: Record<Priority, { color: string; blurb: string }> = {
  P0: { color: "var(--red)", blurb: "Do first" },
  P1: { color: "var(--amber)", blurb: "High value" },
  P2: { color: "var(--blue)", blurb: "Sharpens" },
};

const TOTAL_ITEMS = INSTRUMENTATION_CHECKLIST.reduce((n, t) => n + t.items.length, 0);

/** Inline attribute path chip — matches the DataGapNote code-chip styling. */
const AttrChip = ({ children }: { children: React.ReactNode }) => (
  <code
    style={{
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      fontSize: 10,
      padding: "1px 5px",
      borderRadius: 4,
      background: "color-mix(in oklab, var(--text-3) 14%, transparent)",
      color: "var(--text-2)",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </code>
);

/** Small P0/P1/P2 priority band badge. */
const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const { color } = PRIORITY_META[priority];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.04em",
        color,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`,
        flexShrink: 0,
      }}
    >
      {priority}
    </span>
  );
};

const ChecklistRow = ({ item, color }: { item: ChecklistItem; color: string }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: `color-mix(in oklab, ${color} 4%, var(--surface))`,
      borderLeft: `3px solid ${color}`,
      minWidth: 0,
    }}
  >
    <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
      <span
        style={{
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          fontSize: 10,
          fontWeight: 700,
          color,
          flexShrink: 0,
        }}
      >
        {item.code}
      </span>
      <Text style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", minWidth: 0 }}>
        {item.name}
      </Text>
    </Flex>
    <Flex alignItems="center" gap={4} style={{ flexWrap: "wrap", rowGap: 3 }}>
      {item.attributes.map((a) => (
        <AttrChip key={a}>{a}</AttrChip>
      ))}
    </Flex>
    <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.4 }}>{item.unlocks}</Text>
  </div>
);

/**
 * IA-8 — the centralized "Instrumentation checklist" panel. Collapsible (kept
 * collapsed by default so it doesn't crowd the live audit matrix), but it
 * auto-expands and scrolls into view when the page is opened at the
 * #instrumentation-checklist anchor, which is where the per-page DataGapNote
 * "Full instrumentation checklist →" links resolve to.
 */
export const InstrumentationChecklist = () => {
  const { hash } = useLocation();
  const isHashTarget = hash === `#${INSTRUMENTATION_CHECKLIST_ANCHOR}`;
  const [open, setOpen] = useState(isHashTarget);
  const rootRef = useRef<HTMLDivElement>(null);

  // Deep-link support: arriving at /attributes#instrumentation-checklist opens
  // the panel and scrolls to it. Re-runs if the hash changes while on the page.
  useEffect(() => {
    if (!isHashTarget) return;
    setOpen(true);
    requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isHashTarget, hash]);

  return (
    <div id={INSTRUMENTATION_CHECKLIST_ANCHOR} ref={rootRef} style={{ scrollMarginTop: 16 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 8,
          cursor: "pointer",
          font: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          width: "100%",
          color: "var(--text-2)",
          textAlign: "left",
        }}
      >
        {open ? (
          <ChevronDownIcon size={14} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
        ) : (
          <ChevronRightIcon size={14} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
        )}
        <FormatListNumberedIcon size={16} style={{ color: "var(--blue)", flex: "0 0 auto" }} />
        <Text style={{ fontSize: 12, fontWeight: 600 }}>
          {`Instrumentation checklist — prioritized asks (${TOTAL_ITEMS})`}
        </Text>
      </button>

      {open && (
        <Surface elevation="flat" padding={12} style={{ marginTop: 4 }}>
          <Text
            style={{
              fontSize: 11.5,
              color: "var(--text-3)",
              lineHeight: 1.5,
              marginBottom: 12,
              display: "block",
            }}
          >
            The prioritized span attributes and trace-context fixes the AI workload should
            emit, ordered by leverage. The audit matrix above is the live present / missing
            view; this list adds the priority and the capability each ask unblocks. Per-page
            gap notes link here.
          </Text>

          <Flex flexDirection="column" gap={16}>
            {INSTRUMENTATION_CHECKLIST.map((tier) => {
              const { color } = PRIORITY_META[tier.priority];
              return (
                <Flex key={tier.priority} flexDirection="column" gap={8}>
                  <Flex flexDirection="column" gap={2}>
                    <Flex alignItems="center" gap={8}>
                      <PriorityBadge priority={tier.priority} />
                      <Heading level={3} style={{ fontSize: 13, fontWeight: 700, color }}>
                        {tier.label}
                      </Heading>
                    </Flex>
                    <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>
                      {tier.blurb}
                    </Text>
                  </Flex>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {tier.items.map((item) => (
                      <ChecklistRow key={item.code} item={item} color={color} />
                    ))}
                  </div>
                </Flex>
              );
            })}
          </Flex>
        </Surface>
      )}
    </div>
  );
};

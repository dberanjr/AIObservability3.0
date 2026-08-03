/**
 * User-feedback & prompt-versioning panel (Pulse). Auto-rendered by
 * CapabilityGate when the tenant emits gen_ai.feedback.* or prompt_hub.*.
 */

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MiniStat } from "../../components/MiniStat";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { fmtCount } from "../../data/format";
import { useFeedback } from "./useFeedback";

const FeedbackBody = ({ showExample = false }: { showExample?: boolean }) => {
  const r = useFeedback(showExample);

  const items: BarListItem[] = r.labels.map((l) => ({
    key: l.label,
    label: l.label,
    value: l.count,
    displayValue: fmtCount(l.count),
    filter: {
      attribute: "gen_ai.feedback.label",
      values: [l.label],
      label: "feedback",
    },
  }));

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
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
                label="Feedback events"
                value={fmtCount(r.feedbackCount)}
                color="var(--green-2)"
              />
              <MiniStat
                label="Avg rating"
                value={r.hasRating ? r.avgRating.toFixed(2) : "—"}
              />
              <MiniStat
                label="Prompt versions"
                value={fmtCount(r.promptVersions)}
                sub={r.promptCount > 0 ? `${fmtCount(r.promptCount)} prompts` : undefined}
              />
            </div>
            {items.length > 0 && (
              <Flex flexDirection="column" gap={6}>
                <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  Feedback by label
                </Text>
                <BarList items={items} color="var(--green)" />
              </Flex>
            )}
          </Flex>
        )}
      </Flex>
  );
};

export const FeedbackPanel = ({ showExample = false }: { showExample?: boolean }) => (
  <CollapsibleCard
    title="Feedback & prompt versions"
    subtitle={
      <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
        From <code>gen_ai.feedback.*</code> and{" "}
        <code>gen_ai.prompt_hub.*</code> — surfaced because your telemetry now
        emits them.
      </Text>
    }
    defaultOpen
  >
    <FeedbackBody showExample={showExample} />
  </CollapsibleCard>
);

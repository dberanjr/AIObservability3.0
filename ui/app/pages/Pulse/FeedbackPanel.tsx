/**
 * User-feedback & prompt-versioning panel (Pulse). Auto-rendered by
 * CapabilityGate when the tenant emits gen_ai.feedback.* or prompt_hub.*.
 */

import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MiniStat } from "../../components/MiniStat";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtCount } from "../../data/format";
import { useFeedback } from "./useFeedback";

export const FeedbackPanel = () => {
  const r = useFeedback();

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
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Feedback &amp; prompt versions
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            From <code>gen_ai.feedback.*</code> and{" "}
            <code>gen_ai.prompt_hub.*</code> — surfaced because your telemetry
            now emits them.
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
    </Surface>
  );
};

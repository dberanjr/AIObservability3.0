/**
 * Guardrails & PII safety panel (Pulse). Auto-rendered by CapabilityGate when
 * the tenant emits guardrail or PII-category attributes.
 */

import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MiniStat } from "../../components/MiniStat";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtCount } from "../../data/format";
import { useSafety } from "./useSafety";

export const SafetyPanel = () => {
  const r = useSafety();

  const items: BarListItem[] = r.actions.map((a) => ({
    key: a.action,
    label: a.action,
    value: a.count,
    displayValue: fmtCount(a.count),
    filter: {
      attribute: "gen_ai.response.guardrail_action",
      values: [a.action],
      label: "guardrail action",
    },
  }));

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Safety &amp; guardrails
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            From <code>gen_ai.*.guardrail_*</code> and{" "}
            <code>gen_ai.privacy.*</code> — surfaced because your telemetry now
            emits them.
          </Text>
        </Flex>

        {r.isLoading ? (
          <Skeleton style={{ height: 84, borderRadius: 6 }} />
        ) : (
          <Flex flexDirection="column" gap={12}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <MiniStat
                label="Guardrail-checked spans"
                value={fmtCount(r.guardrailSpans)}
                color="var(--blue)"
              />
              <MiniStat
                label="PII-flagged spans"
                value={fmtCount(r.piiSpans)}
                color={r.piiSpans > 0 ? "var(--amber)" : "var(--text)"}
              />
            </div>
            {items.length > 0 && (
              <Flex flexDirection="column" gap={6}>
                <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  Guardrail outcomes
                </Text>
                <BarList items={items} color="var(--amber)" />
              </Flex>
            )}
          </Flex>
        )}
      </Flex>
    </Surface>
  );
};

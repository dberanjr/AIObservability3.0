import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Donut } from "../../components/charts/Donut";
import type { DonutSlice } from "../../components/charts/Donut";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { EmptyState, emptyCause } from "../../components/EmptyState";
import { fmtCountCompact } from "../../data/format";
import { useProviderMix } from "./useProviderMix";

const ProviderMixBody = () => {
  const result = useProviderMix();
  const emptyKind = emptyCause({ error: result.error });
  const slices: DonutSlice[] = result.shares.map((s) => ({
    key: s.provider,
    label: s.displayName,
    value: s.requests,
    color: s.color,
    sub: s.isBedrockProxy ? "via Bedrock proxy" : undefined,
    // Filter on the raw gen_ai.provider.name values that compose this slice.
    // For Bedrock-proxied vendors these collapse to "aws_bedrock", so the
    // filter is as specific as the raw attribute allows.
    filter:
      s.rawProviders.length > 0
        ? {
            attribute: "gen_ai.provider.name",
            values: s.rawProviders,
            label: "provider",
          }
        : undefined,
  }));

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        {result.isLoading ? (
          <Skeleton style={{ height: 160 }} />
        ) : slices.length === 0 ? (
          <EmptyState
            bare
            cause={emptyKind}
            title={
              emptyKind === "no-activity"
                ? "No provider data in the current scope."
                : undefined
            }
            hint="gen_ai.provider.name"
          />
        ) : (
          <Donut
            slices={slices}
            centerValue={fmtCountCompact(result.totalRequests)}
            centerLabel="requests"
          />
        )}

        <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>
          {result.bedrockProxyCount > 0
            ? "Anthropic / Cohere / Mistral models served via AWS Bedrock are normalized back to their upstream provider — Bedrock-proxied slices are footnoted in the legend."
            : "Provider attribution reads gen_ai.provider.name and unwraps Bedrock vendor prefixes server-side."}
        </Text>
      </Flex>
  );
};

export const ProviderMixDonut = () => (
  <CollapsibleCard title="Provider mix" subtitle="by request count" defaultOpen>
    <ProviderMixBody />
  </CollapsibleCard>
);

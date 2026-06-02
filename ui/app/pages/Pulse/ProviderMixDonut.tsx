import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Donut } from "../../components/charts/Donut";
import type { DonutSlice } from "../../components/charts/Donut";
import { fmtCountCompact } from "../../data/format";
import type { UseProviderMixResult } from "./useProviderMix";

export interface ProviderMixDonutProps {
  result: UseProviderMixResult;
}

export const ProviderMixDonut = ({ result }: ProviderMixDonutProps) => {
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
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Provider mix
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            by request count
          </Text>
        </Flex>

        {result.isLoading ? (
          <Skeleton style={{ height: 160 }} />
        ) : slices.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No provider data in the current scope.
          </Text>
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
    </Surface>
  );
};

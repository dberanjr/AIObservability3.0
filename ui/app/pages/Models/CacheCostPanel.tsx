/**
 * Prompt-cache & SDK-cost panel (FinOps). Auto-rendered by CapabilityGate when
 * the tenant emits cache-token or SDK-cost attributes — otherwise absent.
 */

import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MiniStat } from "../../components/MiniStat";
import { fmtTokens, fmtUSD, fmtPercent } from "../../data/format";
import { useCacheCost } from "./useCacheCost";

export interface CacheCostPanelProps {
  /** Render the canned Demo Mode dataset instead of querying Grail — see
   *  `useCacheCost`'s `showExample` param. */
  showExample?: boolean;
}

export const CacheCostPanel = ({ showExample = false }: CacheCostPanelProps) => {
  const r = useCacheCost(showExample);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Prompt cache &amp; reported cost
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            From <code>gen_ai.usage.cached_tokens</code> /{" "}
            <code>cache_creation_input_tokens</code> /{" "}
            <code>gen_ai.usage.cost</code> — surfaced because your telemetry now
            emits them.
          </Text>
        </Flex>

        {r.isLoading ? (
          <Skeleton style={{ height: 84, borderRadius: 6 }} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            <MiniStat
              label="Cached input tokens"
              value={fmtTokens(r.cacheReadTokens)}
              sub="served from prompt cache"
              color="var(--green-2)"
            />
            <MiniStat
              label="Cache hit rate"
              value={fmtPercent(r.cacheHitRate * 100)}
              sub="of billable input"
            />
            <MiniStat
              label="Cache writes"
              value={fmtTokens(r.cacheWriteTokens)}
              sub="tokens written to cache"
            />
            <MiniStat
              label="SDK-reported cost"
              value={r.sdkCost > 0 ? fmtUSD(r.sdkCost) : "—"}
              sub={r.sdkCost > 0 ? "provider-reported USD" : "not reported"}
            />
          </div>
        )}
      </Flex>
    </Surface>
  );
};

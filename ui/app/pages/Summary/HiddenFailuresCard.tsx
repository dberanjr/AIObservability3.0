import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtCount } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SummaryCard } from "./SummaryCard";
import { useHiddenFailures } from "./useHiddenFailures";

/**
 * Hidden · 200-OK donut: HTTP-200 responses that are really failures, split into
 * refusals / max-token truncation / content-filter blocks (the load-bearing
 * finish_reasons signal on this tenant). Drills to Explorer, where the
 * logical-error catalog lives.
 */
export const HiddenFailuresCard = () => {
  const hidden = useHiddenFailures();

  const items: BarListItem[] = hidden.categories.map((c) => ({
    key: c.key,
    label: c.label,
    value: c.count,
    displayValue: fmtCount(c.count),
  }));
  const colorByKey = new Map(hidden.categories.map((c) => [c.key, c.color]));

  return (
    <SummaryCard
      title="Hidden · 200-OK"
      info="HTTP-200 LLM responses that are really failures, split by cause: refusals (refusal_reason, or finish_reasons contains 'refusal'), max-token truncation (finish_reasons 'max_tokens'), content-filter blocks ('content_filter'), and other provider/guardrail markers (gen_ai.error.type / guardrail.action / moderation.action). One dedup'd scan over LLM spans (gen_ai.provider.name present); counts are sampled aggregates, extrapolated. An empty result depends on finish_reasons instrumentation being present — it is not a guaranteed all-clear."
      drill={{ label: "Explorer", to: "/explorer" }}
    >
      {hidden.isLoading && items.length === 0 ? (
        <Skeleton style={{ height: 130, borderRadius: 8 }} />
      ) : hidden.error ? (
        <ErrorState bare error={hidden.error} />
      ) : hidden.total === 0 ? (
        <EmptyState
          bare
          title="No hidden failures in this window"
          description="No 200-OK responses matched a refusal, truncation, or content-filter signal. Absence here depends on finish_reasons / status instrumentation being present — it isn't a guaranteed all-clear."
        />
      ) : (
        <Flex flexDirection="column" gap={12}>
          <Flex alignItems="baseline" gap={8}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtCount(hidden.total)}
            </Text>
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              200-OK failures
            </Text>
          </Flex>
          <BarList
            items={items}
            color={(item) => colorByKey.get(item.key) ?? "var(--red)"}
          />
        </Flex>
      )}
    </SummaryCard>
  );
};

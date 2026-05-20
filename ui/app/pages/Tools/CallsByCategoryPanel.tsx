import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import { fmtCount } from "../../data/format";
import { CATEGORY_COLOR, TOOL_CATEGORIES } from "./categories";
import type { Tool } from "./useTools";

export interface CallsByCategoryPanelProps {
  tools: Tool[];
  isLoading: boolean;
}

export const CallsByCategoryPanel = ({
  tools,
  isLoading,
}: CallsByCategoryPanelProps) => {
  const items = useMemo(() => {
    const counts = new Map<string, { calls: number; toolCount: number }>();
    for (const t of tools) {
      const existing = counts.get(t.category);
      counts.set(t.category, {
        calls: (existing?.calls ?? 0) + t.calls,
        toolCount: (existing?.toolCount ?? 0) + 1,
      });
    }
    return TOOL_CATEGORIES.filter((c) => counts.get(c))
      .map((c) => {
        const entry = counts.get(c)!;
        return {
          key: c,
          label: c,
          value: entry.calls,
          displayValue: fmtCount(entry.calls),
          secondary: `${entry.toolCount} ${entry.toolCount === 1 ? "tool" : "tools"}`,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [tools]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Calls by category
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Total invocations across each tool family
          </Text>
        </Flex>

        {isLoading && items.length === 0 ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : items.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No tool spans observed in the current scope.
          </Text>
        ) : (
          <BarList
            items={items}
            color={(item) => CATEGORY_COLOR[item.key as keyof typeof CATEGORY_COLOR]}
          />
        )}
      </Flex>
    </Surface>
  );
};

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { FilterTrigger } from "../FilterTrigger";

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Right-aligned primary string (e.g. "$48.12" or "1.2M tok"). */
  displayValue: string;
  /** Optional secondary line below the bar (e.g. "5,904 invocations"). */
  secondary?: string;
  /** When set, the label becomes click-to-filter on this attribute/value(s). */
  filter?: { attribute: string; values: string[]; label?: string };
}

export interface BarListProps {
  items: BarListItem[];
  /** Color for the bar; pass a function to color per row (e.g. by severity). */
  color?: string | ((item: BarListItem) => string);
  /** Caps the fill scale. Defaults to max(values). */
  max?: number;
  /** Maximum rows to render. */
  limit?: number;
  /** When set, each row becomes clickable and calls this with the item. */
  onSelect?: (item: BarListItem) => void;
}

export const BarList = ({
  items,
  color = "var(--blue)",
  max,
  limit,
  onSelect,
}: BarListProps) => {
  const slice = limit != null ? items.slice(0, limit) : items;
  const capped = max ?? Math.max(1, ...items.map((i) => i.value));

  return (
    <Flex flexDirection="column" gap={8}>
      {onSelect && (
        <style>{`.barlist-row{cursor:pointer;border-radius:6px;margin:-2px -4px;padding:2px 4px}.barlist-row:hover{background:var(--surface-2)}`}</style>
      )}
      {slice.map((item) => {
        const pct = capped > 0 ? (item.value / capped) * 100 : 0;
        const c = typeof color === "function" ? color(item) : color;
        return (
          <Flex
            key={item.key}
            flexDirection="column"
            gap={4}
            {...(onSelect
              ? {
                  className: "barlist-row",
                  role: "button",
                  tabIndex: 0,
                  onClick: () => onSelect(item),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(item);
                    }
                  },
                }
              : {})}
          >
            <Flex alignItems="baseline" justifyContent="space-between" gap={8}>
              {item.filter ? (
                <FilterTrigger
                  attribute={item.filter.attribute}
                  value={item.filter.values}
                  label={item.filter.label ?? item.label}
                  style={{ minWidth: 0, flex: 1 }}
                >
                  <Text
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 12.5,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                    }}
                  >
                    {item.label}
                  </Text>
                </FilterTrigger>
              ) : (
                <Text
                  style={{
                    fontFamily: "var(--mono, monospace)",
                    fontSize: 12.5,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {item.label}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                  flex: "0 0 auto",
                }}
              >
                {item.displayValue}
              </Text>
            </Flex>
            <div
              style={{
                position: "relative",
                height: 6,
                background: "var(--surface-3)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct.toFixed(1)}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${c}, color-mix(in oklab, ${c} 50%, transparent))`,
                  borderRadius: 999,
                }}
              />
            </div>
            {item.secondary && (
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                {item.secondary}
              </Text>
            )}
          </Flex>
        );
      })}
    </Flex>
  );
};

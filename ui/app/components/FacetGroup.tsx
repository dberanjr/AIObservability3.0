import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Checkbox } from "@dynatrace/strato-components/forms";

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
  color?: string;
}

export interface FacetGroupProps {
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  maxVisible?: number;
}

const Row = ({
  option,
  checked,
  onToggle,
}: {
  option: FacetOption;
  checked: boolean;
  onToggle: () => void;
}) => (
  <Flex
    alignItems="center"
    gap={6}
    style={{
      padding: "3px 6px",
      borderRadius: 4,
      background: checked
        ? "color-mix(in oklab, var(--blue) 8%, transparent)"
        : "transparent",
      minWidth: 0,
    }}
  >
    <Checkbox
      name={option.value}
      value={checked}
      onChange={onToggle}
      aria-label={option.label}
    />
    {option.color && (
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: option.color,
          flex: "0 0 auto",
        }}
      />
    )}
    <Text
      style={{
        fontSize: 12.5,
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: 1,
        minWidth: 0,
      }}
    >
      {option.label}
    </Text>
    {option.count != null && (
      <Text
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontVariantNumeric: "tabular-nums",
          flex: "0 0 auto",
        }}
      >
        {option.count.toLocaleString()}
      </Text>
    )}
  </Flex>
);

/**
 * Sidebar facet (DESIGN_HANDOFF §3). Uppercase eyebrow label + checkbox rows.
 * Multi-select (OR within facet, AND across facets — that AND is enforced by
 * the consumer when combining multiple FacetGroups).
 */
export const FacetGroup = ({
  label,
  options,
  selected,
  onChange,
  maxVisible,
}: FacetGroupProps) => {
  const [expanded, setExpanded] = useState(false);
  const limit = maxVisible ?? options.length;
  const visible = expanded ? options : options.slice(0, limit);
  const hiddenCount = options.length - visible.length;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <Flex flexDirection="column" gap={6}>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {label}
      </Text>
      {visible.length === 0 ? (
        <Text style={{ fontSize: 11.5, color: "var(--text-4)" }}>
          No values in current scope.
        </Text>
      ) : (
        <Flex flexDirection="column" gap={2}>
          {visible.map((o) => (
            <Row
              key={o.value}
              option={o}
              checked={selected.includes(o.value)}
              onToggle={() => toggle(o.value)}
            />
          ))}
        </Flex>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 11,
            color: "var(--blue)",
            padding: "2px 6px",
            alignSelf: "flex-start",
          }}
        >
          {expanded ? "Show fewer" : `+${hiddenCount} more`}
        </button>
      )}
    </Flex>
  );
};

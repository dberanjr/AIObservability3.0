import React from "react";
import { useGlobalFilters } from "../scope/GlobalFilterContext";

export interface FilterTriggerProps {
  /** Span attribute to filter on, e.g. "gen_ai.agent.name". */
  attribute: string;
  /** Raw value(s) to match. For canonical displays (models) pass every raw
   *  variant so all of them are captured. */
  value: string | string[];
  /** Human label for the tooltip, defaults to the attribute. */
  label?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Wraps any data element to make it click-to-filter: clicking adds (or merges)
 * a global filter condition for `attribute` = `value`. Clicking different
 * elements stacks conditions (AND across attributes, OR within one). Stops
 * propagation so it doesn't also trigger a parent row's onClick (e.g. expand).
 */
export const FilterTrigger = ({
  attribute,
  value,
  label,
  children,
  style,
}: FilterTriggerProps) => {
  const { upsertCondition } = useGlobalFilters();
  const values = (Array.isArray(value) ? value : [value]).filter(
    (v) => typeof v === "string" && v.length > 0,
  );

  const apply = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (values.length > 0) upsertCondition(attribute, values);
  };

  if (values.length === 0) return <>{children}</>;

  return (
    <span
      role="button"
      tabIndex={0}
      title={`Filter by ${label ?? attribute}`}
      onClick={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          apply(e);
        }
      }}
      className="aiobs-filter-trigger"
      style={{
        cursor: "pointer",
        borderRadius: 3,
        transition: "background 0.12s, box-shadow 0.12s",
        ...style,
      }}
    >
      {children}
    </span>
  );
};

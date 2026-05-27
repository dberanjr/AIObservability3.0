import React, { useState, useRef, useEffect } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ChevronDownIcon } from "@dynatrace/strato-icons";
import { useGlobalFilters } from "../scope/GlobalFilterContext";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "../scope/ScopeContext";
import { dqlTimeArg, dqlIdArray, scopeFilterClause } from "../scope/queries";
import type { Timeframe } from "../scope/types";

interface FilterCategory {
  id: "agent" | "model" | "provider" | "tool" | "service";
  label: string;
  attribute: string;
  icon?: string;
}

const FILTER_CATEGORIES: FilterCategory[] = [
  { id: "agent", label: "Agent", attribute: "gen_ai.agent.name" },
  { id: "model", label: "Model", attribute: "gen_ai.request.model" },
  { id: "provider", label: "Provider", attribute: "gen_ai.provider.name" },
  { id: "tool", label: "Tool", attribute: "gen_ai.tool.name" },
  { id: "service", label: "Service", attribute: "service.name" },
];

const buildFilterValuesQuery = (
  attribute: string,
  timeframe: Timeframe,
): string => {
  const to = timeframe.to ?? "now()";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to)}, scanLimitGBytes: 200
| filter isNotNull(${attribute})
| summarize values = collectDistinct(${attribute})
`.trim();
};

interface FilterDropdownProps {
  category: FilterCategory;
  isSelected: boolean;
  selectedCount: number;
  onSelect: (values: string[]) => void;
  currentValues: string[];
  timeframe: Timeframe;
}

const FilterDropdown = ({
  category,
  isSelected,
  selectedCount,
  onSelect,
  currentValues,
  timeframe,
}: FilterDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = buildFilterValuesQuery(category.attribute, timeframe);
  const { data, isLoading } = useScopedDql<{ values?: Array<{ value: string }> }>(
    open ? query : "",
    { enabled: open, staleTime: 60_000 },
  );

  const allValues = (data?.records?.[0]?.values ?? [])
    .filter((v): v is { value: string } => !!v?.value)
    .map((v) => v.value);

  const filteredValues = searchQuery
    ? allValues.filter((v) =>
        v.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allValues;

  const handleValueToggle = (value: string) => {
    if (currentValues.includes(value)) {
      onSelect(currentValues.filter((v) => v !== value));
    } else {
      onSelect([...currentValues, value]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "relative",
        minWidth: 180,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "6px 10px",
          borderRadius: 4,
          background: isSelected ? "var(--blue-surface)" : "transparent",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--text)",
          fontWeight: 500,
          whiteSpace: "nowrap",
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>
          {category.icon || "ABC"}
        </span>
        <span>{category.label}</span>
        {selectedCount > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--blue)",
              color: "white",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {selectedCount}
          </span>
        )}
        <ChevronDownIcon
          size={12}
          style={{
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            minWidth: 250,
            maxHeight: 350,
            zIndex: 10000,
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={`Filter ${category.label.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              all: "unset",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--text)",
            }}
          />

          <div style={{ overflow: "auto", flex: 1 }}>
            {isLoading ? (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: "12px" }}>
                Loading…
              </Text>
            ) : filteredValues.length === 0 ? (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: "12px" }}>
                {searchQuery ? "No matches" : "No options"}
              </Text>
            ) : (
              filteredValues.map((value) => (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border-subtle)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget).style.background = "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget).style.background = "transparent";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={currentValues.includes(value)}
                    onChange={() => handleValueToggle(value)}
                    style={{
                      cursor: "pointer",
                      width: 14,
                      height: 14,
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text)" }}>
                    {value || "(empty)"}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AttributeFilterBar = () => {
  const { scope } = useScope();
  const { filters, setAgents, setModels, setProviders, setTools, setServices, clearAll, hasFilters } =
    useGlobalFilters();

  const filterMap = {
    agent: { values: filters.agents, setter: setAgents },
    model: { values: filters.models, setter: setModels },
    provider: { values: filters.providers, setter: setProviders },
    tool: { values: filters.tools || [], setter: setTools || (() => {}) },
    service: { values: filters.services || [], setter: setServices || (() => {}) },
  };

  return (
    <Flex
      gap={8}
      alignItems="center"
      style={{
        padding: "8px 20px",
        background: "linear-gradient(90deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.01))",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      {FILTER_CATEGORIES.map((category) => {
        const filterData = filterMap[category.id as keyof typeof filterMap];
        const selectedCount = filterData?.values?.length || 0;

        return (
          <FilterDropdown
            key={category.id}
            category={category}
            isSelected={selectedCount > 0}
            selectedCount={selectedCount}
            onSelect={filterData?.setter || (() => {})}
            currentValues={filterData?.values || []}
            timeframe={scope.timeframe}
          />
        );
      })}

      {hasFilters && (
        <Button
          variant="default"
          onClick={clearAll}
          style={{ marginLeft: "auto", fontSize: 11 }}
          aria-label="Clear all filters"
        >
          Clear all
        </Button>
      )}
    </Flex>
  );
};

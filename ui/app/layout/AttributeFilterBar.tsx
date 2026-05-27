import React, { useState, useRef, useEffect } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ChevronDownIcon } from "@dynatrace/strato-icons";
import { useGlobalFilters } from "../scope/GlobalFilterContext";
import { useFilterOptions } from "../scope/useFilterOptions";

interface FilterDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onSelect: (values: string[]) => void;
  isLoading: boolean;
}

const FilterDropdown = ({
  label,
  options,
  selected,
  onSelect,
  isLoading,
}: FilterDropdownProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const displayLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? selected[0]
        : `${label} ${selected.length}`;

  return (
    <div style={{ position: "relative", minWidth: 120 }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: 4,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--text)",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {displayLabel}
        <ChevronDownIcon size={12} />
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
            padding: 8,
            zIndex: 10000,
            minWidth: 180,
            maxHeight: 300,
            overflow: "auto",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
          }}
        >
          {isLoading ? (
            <Text style={{ fontSize: 11, color: "var(--text-3)", padding: "8px 0" }}>
              Loading…
            </Text>
          ) : options.length === 0 ? (
            <Text style={{ fontSize: 11, color: "var(--text-3)", padding: "8px 0" }}>
              No options
            </Text>
          ) : (
            options.map((option) => (
              <label
                key={option}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text)",
                  borderRadius: 3,
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = "color-mix(in oklab, var(--blue) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = "transparent";
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelect([...selected, option]);
                    } else {
                      onSelect(selected.filter((s) => s !== option));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                />
                {option || "(empty)"}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export const AttributeFilterBar = () => {
  const { filters, setAgents, setModels, setProviders, clearAll, hasFilters } =
    useGlobalFilters();
  const { agents, models, providers, isLoading, error } = useFilterOptions();

  return (
    <Flex
      gap={12}
      alignItems="center"
      style={{
        padding: "8px 20px",
        background: "linear-gradient(90deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.01))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginRight: 4,
        }}
      >
        Filters
      </Text>

      <FilterDropdown
        label="Agent"
        options={agents}
        selected={filters.agents}
        onSelect={setAgents}
        isLoading={isLoading}
      />

      <FilterDropdown
        label="Model"
        options={models}
        selected={filters.models}
        onSelect={setModels}
        isLoading={isLoading}
      />

      <FilterDropdown
        label="Provider"
        options={providers}
        selected={filters.providers}
        onSelect={setProviders}
        isLoading={isLoading}
      />

      {hasFilters && (
        <Button
          variant="default"
          onClick={clearAll}
          style={{ marginLeft: "auto" }}
          aria-label="Clear all filters"
        >
          <Button.Prefix style={{ fontSize: 14, lineHeight: 1 }}>
            ✕
          </Button.Prefix>
          Clear all
        </Button>
      )}
    </Flex>
  );
};

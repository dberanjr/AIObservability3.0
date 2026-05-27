import React, { useState, useRef, useEffect } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ChevronDownIcon } from "@dynatrace/strato-icons";
import { useGlobalFilters } from "../scope/GlobalFilterContext";
import { useFilterOptions } from "../scope/useFilterOptions";

interface FilterItem {
  label: string;
  type: "agent" | "model" | "provider";
  isSelected: boolean;
}

export const AttributeFilterBar = () => {
  const { filters, setAgents, setModels, setProviders, clearAll, hasFilters } =
    useGlobalFilters();
  const { agents, models, providers, isLoading } = useFilterOptions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build all filterable items
  const allItems: FilterItem[] = [
    ...agents.map((agent) => ({
      label: `Agent: ${agent}`,
      type: "agent" as const,
      value: agent,
      isSelected: filters.agents.includes(agent),
    })),
    ...models.map((model) => ({
      label: `Model: ${model}`,
      type: "model" as const,
      value: model,
      isSelected: filters.models.includes(model),
    })),
    ...providers.map((provider) => ({
      label: `Provider: ${provider}`,
      type: "provider" as const,
      value: provider,
      isSelected: filters.providers.includes(provider),
    })),
  ];

  // Filter items based on search
  const filteredItems = searchQuery
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allItems;

  // Sort: selected first, then by label
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.isSelected !== b.isSelected) return b.isSelected ? 1 : -1;
    return a.label.localeCompare(b.label);
  });

  const handleItemToggle = (item: any) => {
    if (item.type === "agent") {
      if (filters.agents.includes(item.value)) {
        setAgents(filters.agents.filter((a) => a !== item.value));
      } else {
        setAgents([...filters.agents, item.value]);
      }
    } else if (item.type === "model") {
      if (filters.models.includes(item.value)) {
        setModels(filters.models.filter((m) => m !== item.value));
      } else {
        setModels([...filters.models, item.value]);
      }
    } else if (item.type === "provider") {
      if (filters.providers.includes(item.value)) {
        setProviders(filters.providers.filter((p) => p !== item.value));
      } else {
        setProviders([...filters.providers, item.value]);
      }
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Focus input when menu opens
  useEffect(() => {
    if (menuOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [menuOpen]);

  const selectedCount = filters.agents.length + filters.models.length + filters.providers.length;

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
      <div style={{ position: "relative", flex: 1, minWidth: 300 }} ref={menuRef}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 6,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Type to filter"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              all: "unset",
              flex: 1,
              fontSize: 13,
              color: "var(--text)",
            }}
          />
          {selectedCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 20,
                height: 20,
                borderRadius: "50%",
                background: "var(--blue)",
                color: "white",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {selectedCount}
            </span>
          )}
          <ChevronDownIcon
            size={14}
            style={{
              color: "var(--text-3)",
              transition: "transform 0.2s",
              transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>

        {menuOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              maxHeight: 400,
              overflow: "auto",
              zIndex: 10000,
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
            }}
          >
            {isLoading ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)", padding: "12px" }}>
                Loading…
              </Text>
            ) : sortedItems.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)", padding: "12px" }}>
                {searchQuery ? "No matching filters" : "No filters available"}
              </Text>
            ) : (
              sortedItems.map((item, idx) => (
                <label
                  key={`${item.type}-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderBottom: idx < sortedItems.length - 1 ? "1px solid var(--border-subtle)" : "none",
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
                    checked={item.isSelected}
                    onChange={() => handleItemToggle(item)}
                    style={{
                      cursor: "pointer",
                      width: 16,
                      height: 16,
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text)" }}>
                    {item.label}
                  </span>
                </label>
              ))
            )}

            {hasFilters && sortedItems.length > 0 && (
              <>
                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    padding: "8px 12px",
                  }}
                >
                  <Button
                    variant="default"
                    onClick={(e) => {
                      e.preventDefault();
                      clearAll();
                      setSearchQuery("");
                    }}
                    style={{ width: "100%", fontSize: 12 }}
                  >
                    Clear all filters
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Flex>
  );
};

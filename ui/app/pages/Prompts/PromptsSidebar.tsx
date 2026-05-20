import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { TextInput } from "@dynatrace/strato-components/forms";
import { FacetGroup } from "../../components/FacetGroup";
import type { PromptKind, PromptsFacets, PromptsFilter } from "./usePrompts";

export type PrivacyMode = "mask" | "raw";

const SegLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-3)",
    }}
  >
    {children}
  </Text>
);

const PrivacySegment = ({
  value,
  onChange,
}: {
  value: PrivacyMode;
  onChange: (next: PrivacyMode) => void;
}) => {
  const options: Array<{ value: PrivacyMode; label: string }> = [
    { value: "mask", label: "Mask PII" },
    { value: "raw", label: "Show raw" },
  ];
  return (
    <Flex flexDirection="column" gap={6}>
      <SegLabel>Privacy</SegLabel>
      <div
        role="radiogroup"
        aria-label="Privacy"
        style={{
          display: "inline-flex",
          padding: 2,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 999,
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text)" : "var(--text-2)",
                background: active ? "var(--surface)" : "transparent",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </Flex>
  );
};

export interface PromptsSidebarProps {
  facets: PromptsFacets;
  filter: PromptsFilter;
  privacy: PrivacyMode;
  onFilterChange: (next: PromptsFilter) => void;
  onPrivacyChange: (next: PrivacyMode) => void;
}

export const PromptsSidebar = ({
  facets,
  filter,
  privacy,
  onFilterChange,
  onPrivacyChange,
}: PromptsSidebarProps) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={16} style={{ width: 210 }}>
      <Flex flexDirection="column" gap={4}>
        <SegLabel>Search</SegLabel>
        <TextInput
          name="prompts-search"
          value={filter.search ?? ""}
          onChange={(value) =>
            onFilterChange({ ...filter, search: value || undefined })
          }
          placeholder="Match prompt or response"
        />
      </Flex>

      <FacetGroup
        label="Type"
        options={facets.kinds.map((k) => ({
          value: k.value,
          label: k.value,
          count: k.count,
        }))}
        selected={filter.kinds ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            kinds: next.length > 0 ? (next as PromptKind[]) : undefined,
          })
        }
      />

      <FacetGroup
        label="Service"
        options={facets.services.map((s) => ({
          value: s.value,
          label: s.value,
          count: s.count,
        }))}
        selected={filter.services ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            services: next.length > 0 ? next : undefined,
          })
        }
        maxVisible={6}
      />

      <FacetGroup
        label="Model"
        options={facets.models.map((m) => ({
          value: m.value,
          label: m.value,
          count: m.count,
        }))}
        selected={filter.models ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            models: next.length > 0 ? next : undefined,
          })
        }
        maxVisible={6}
      />

      <PrivacySegment value={privacy} onChange={onPrivacyChange} />
    </Flex>
  </Surface>
);

import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { TextInput } from "@dynatrace/strato-components/forms";
import { FacetGroup } from "../../components/FacetGroup";
import type { ExplorerFacets, ExplorerFilter } from "./useAIServices";
import type { ProviderId } from "../../detection/attributes";

export interface ExplorerSidebarProps {
  facets: ExplorerFacets;
  filter: ExplorerFilter;
  onFilterChange: (next: ExplorerFilter) => void;
}

export const ExplorerSidebar = ({
  facets,
  filter,
  onFilterChange,
}: ExplorerSidebarProps) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={16} style={{ width: 200 }}>
      <Flex flexDirection="column" gap={4}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          Search
        </Text>
        <TextInput
          name="search"
          value={filter.search ?? ""}
          onChange={(value) =>
            onFilterChange({ ...filter, search: value || undefined })
          }
          placeholder="Search services, agents, models"
        />
      </Flex>

      <FacetGroup
        label="Provider"
        // All providers are listed (per the Session-6 handoff), but the ones
        // with no services in scope are pushed to the bottom so the useful,
        // non-empty facets lead (Explorer-12). Stable within each group.
        options={[...facets.providers]
          .sort((a, b) => (a.count > 0 ? 0 : 1) - (b.count > 0 ? 0 : 1))
          .map((p) => ({
            value: p.id,
            label: p.label,
            count: p.count,
            color: p.color,
          }))}
        selected={filter.providers ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            providers: next.length > 0 ? (next as ProviderId[]) : undefined,
          })
        }
      />

      <FacetGroup
        label="Framework"
        options={facets.frameworks.map((f) => ({
          value: f.value,
          label: f.value,
          count: f.count,
        }))}
        selected={filter.frameworks ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            frameworks: next.length > 0 ? next : undefined,
          })
        }
        maxVisible={4}
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
        maxVisible={4}
      />
    </Flex>
  </Surface>
);

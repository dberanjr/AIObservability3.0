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
          placeholder="Filter services"
        />
      </Flex>

      <FacetGroup
        label="Provider"
        options={facets.providers.map((p) => ({
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

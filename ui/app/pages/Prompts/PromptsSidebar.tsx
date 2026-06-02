import React, { useState, useRef, useEffect } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  TextInput,
  Checkbox,
  Select,
  NumberInputV2,
} from "@dynatrace/strato-components/forms";
import { FacetGroup } from "../../components/FacetGroup";
import type {
  PromptKind,
  PromptsFacets,
  PromptsFilter,
  LatencyFilter,
} from "./usePrompts";

export type PrivacyMode = "mask" | "raw";

type LatOp = "any" | "gt" | "lt" | "between";

/** Errors / PII / Warnings quick toggles. */
const StatusToggles = ({
  filter,
  onFilterChange,
}: {
  filter: PromptsFilter;
  onFilterChange: (next: PromptsFilter) => void;
}) => {
  const rows: Array<{ key: keyof PromptsFilter; label: string }> = [
    { key: "onlyErrors", label: "Errored requests" },
    { key: "onlyPii", label: "PII detected" },
    { key: "onlyWarnings", label: "Warnings" },
  ];
  return (
    <Flex flexDirection="column" gap={6}>
      <SegLabel>Status</SegLabel>
      <Flex flexDirection="column" gap={2}>
        {rows.map((r) => (
          <Flex key={r.key} alignItems="center" gap={6} style={{ padding: "3px 6px" }}>
            <Checkbox
              name={r.key}
              value={Boolean(filter[r.key])}
              onChange={(checked) =>
                onFilterChange({ ...filter, [r.key]: checked ? true : undefined })
              }
              aria-label={r.label}
            />
            <Text style={{ fontSize: 12.5, color: "var(--text)" }}>{r.label}</Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
};

/**
 * Response-time (duration) filter: >, <, or between, in milliseconds.
 *
 * The number inputs are debounced — committing the filter (which triggers a new
 * DQL query) only after 1s of inactivity, or immediately on Enter / blur — so
 * typing "3000" doesn't fire four queries. The operator select commits at once.
 */
const LatencyControl = ({
  value,
  onChange,
}: {
  value?: LatencyFilter;
  onChange: (next: LatencyFilter | undefined) => void;
}) => {
  const op: LatOp = value?.op ?? "any";
  const [draftMin, setDraftMin] = useState<number | null>(value?.min ?? null);
  const [draftMax, setDraftMax] = useState<number | null>(value?.max ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync drafts when the value changes externally (tile click, reset, etc.).
  useEffect(() => {
    setDraftMin(value?.min ?? null);
    setDraftMax(value?.max ?? null);
  }, [value?.min, value?.max]);

  // Clear any pending debounce on unmount.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (
    nextOp: LatOp,
    min: number | null,
    max: number | null,
  ) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (nextOp === "any") {
      onChange(undefined);
      return;
    }
    onChange({ op: nextOp, min: min ?? undefined, max: max ?? undefined });
  };

  const scheduleCommit = (min: number | null, max: number | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(op, min, max), 1000);
  };

  const setOp = (next: LatOp) => commit(next, draftMin, draftMax);
  const onMin = (n: number | null) => {
    setDraftMin(n);
    scheduleCommit(n, draftMax);
  };
  const onMax = (n: number | null) => {
    setDraftMax(n);
    scheduleCommit(draftMin, n);
  };
  const commitNow = () => commit(op, draftMin, draftMax);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitNow();
  };

  return (
    <Flex flexDirection="column" gap={6}>
      <SegLabel>Response time (ms)</SegLabel>
      <Select<string>
        name="latency-op"
        value={op}
        onChange={(v) => v && setOp(v as LatOp)}
      >
        <Select.Trigger placeholder="Any" aria-label="Response time operator" />
        <Select.Content>
          <Select.Option value="any">Any</Select.Option>
          <Select.Option value="gt">Greater than</Select.Option>
          <Select.Option value="lt">Less than</Select.Option>
          <Select.Option value="between">Between</Select.Option>
        </Select.Content>
      </Select>
      {(op === "gt" || op === "between") && (
        <NumberInputV2
          name="latency-min"
          value={draftMin}
          onChange={onMin}
          onBlur={commitNow}
          onKeyDown={onKey}
          placeholder={op === "between" ? "Min ms" : "Min ms (>)"}
        />
      )}
      {(op === "lt" || op === "between") && (
        <NumberInputV2
          name="latency-max"
          value={draftMax}
          onChange={onMax}
          onBlur={commitNow}
          onKeyDown={onKey}
          placeholder={op === "between" ? "Max ms" : "Max ms (<)"}
        />
      )}
    </Flex>
  );
};

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
    <Flex flexDirection="column" gap={16} style={{ width: "100%", minWidth: 0 }}>
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

      <FacetGroup
        label="Agent"
        options={facets.agents.map((a) => ({
          value: a.value,
          label: a.value,
          count: a.count,
        }))}
        selected={filter.agents ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            agents: next.length > 0 ? next : undefined,
          })
        }
        maxVisible={6}
      />

      <FacetGroup
        label="Provider"
        options={facets.providers.map((p) => ({
          value: p.value,
          label: p.value,
          count: p.count,
        }))}
        selected={filter.providers ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            providers: next.length > 0 ? next : undefined,
          })
        }
        maxVisible={6}
      />

      <FacetGroup
        label="Operation"
        options={facets.operations.map((o) => ({
          value: o.value,
          label: o.value,
          count: o.count,
        }))}
        selected={filter.operations ?? []}
        onChange={(next) =>
          onFilterChange({
            ...filter,
            operations: next.length > 0 ? next : undefined,
          })
        }
        maxVisible={6}
      />

      <StatusToggles filter={filter} onFilterChange={onFilterChange} />

      <LatencyControl
        value={filter.latency}
        onChange={(next) => onFilterChange({ ...filter, latency: next })}
      />

      <PrivacySegment value={privacy} onChange={onPrivacyChange} />
    </Flex>
  </Surface>
);

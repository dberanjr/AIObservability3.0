import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import type { ModelType } from "./useModels";
import { MODEL_TYPE_LABEL } from "./useModels";

export type ModelTypeFilter = "all" | ModelType;

const OPTIONS: { value: ModelTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "generative", label: MODEL_TYPE_LABEL.generative },
  { value: "embedding", label: MODEL_TYPE_LABEL.embedding },
  { value: "reranking", label: MODEL_TYPE_LABEL.reranking },
];

export interface ModelTypeSegmentedProps {
  value: ModelTypeFilter;
  counts: Record<ModelTypeFilter, number>;
  onChange: (next: ModelTypeFilter) => void;
}

export const ModelTypeSegmented = ({
  value,
  counts,
  onChange,
}: ModelTypeSegmentedProps) => (
  <Flex flexDirection="column" gap={6}>
    <Flex alignItems="center" gap={12}>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        Model type
      </Text>
      <div
        role="radiogroup"
        aria-label="Model type"
        style={{
          display: "inline-flex",
          padding: 2,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 999,
        }}
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          const count = counts[opt.value];
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
                padding: "4px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text)" : "var(--text-2)",
                background: active ? "var(--surface)" : "transparent",
              }}
            >
              {opt.label}{" "}
              <Text
                as="span"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text-3)",
                  marginLeft: 4,
                }}
              >
                {count}
              </Text>
            </button>
          );
        })}
      </div>
    </Flex>
    <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
      Type inferred from <code>gen_ai.operation.name</code> where available,
      else from model name.
    </Text>
  </Flex>
);

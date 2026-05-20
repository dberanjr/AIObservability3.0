import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  SAMPLING_LABELS,
  SAMPLING_RATIOS,
  useSampling,
} from "../scope/SamplingContext";

export const SamplingSegmented = () => {
  const { samplingRatio, setSamplingRatio } = useSampling();
  return (
    <Flex alignItems="center" gap={6}>
      <Text
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        Sampling
      </Text>
      <div
        role="radiogroup"
        aria-label="Sampling ratio"
        style={{
          display: "inline-flex",
          padding: 2,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 999,
        }}
      >
        {SAMPLING_RATIOS.map((value) => {
          const active = value === samplingRatio;
          const label = SAMPLING_LABELS[value];
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={
                value === 1
                  ? "Disable sampling (every record)"
                  : `Sample 1 in ${value} records`
              }
              onClick={() => setSamplingRatio(value)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text)" : "var(--text-2)",
                background: active ? "var(--surface)" : "transparent",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </Flex>
  );
};

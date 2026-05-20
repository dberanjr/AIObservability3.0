import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
} from "../scope/ScanLimitContext";

export const ScanLimitSegmented = () => {
  const { scanLimitGb, setScanLimit } = useScanLimit();
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
        Scan limit
      </Text>
      <div
        role="radiogroup"
        aria-label="Scan limit"
        style={{
          display: "inline-flex",
          padding: 2,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 999,
        }}
      >
        {SCAN_LIMITS_GB.map((value) => {
          const active = value === scanLimitGb;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Set scan limit to ${SCAN_LIMIT_LABELS[value]}`}
              onClick={() => setScanLimit(value)}
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
              {SCAN_LIMIT_LABELS[value]}
            </button>
          );
        })}
      </div>
    </Flex>
  );
};

import React from "react";
import { Select } from "@dynatrace/strato-components/forms";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
  type ScanLimitGb,
} from "../scope/ScanLimitContext";

/**
 * Compact dropdown for the global scan-limit setting. (Originally a segmented
 * control — switched to a Select so it stays visible in narrow toolbars.)
 */
export const ScanLimitSegmented = () => {
  const { scanLimitGb, setScanLimit } = useScanLimit();
  return (
    <div style={{ minWidth: 110 }}>
      <Select<string>
        name="scan-limit"
        value={String(scanLimitGb)}
        onChange={(v) => {
          if (!v) return;
          const next = Number(v) as ScanLimitGb;
          if (SCAN_LIMITS_GB.includes(next)) setScanLimit(next);
        }}
      >
        <Select.Trigger
          placeholder={SCAN_LIMIT_LABELS[scanLimitGb]}
          aria-label="Scan limit"
        />
        <Select.Content>
          {SCAN_LIMITS_GB.map((value) => (
            <Select.Option key={value} value={String(value)}>
              {SCAN_LIMIT_LABELS[value]}
            </Select.Option>
          ))}
        </Select.Content>
      </Select>
    </div>
  );
};

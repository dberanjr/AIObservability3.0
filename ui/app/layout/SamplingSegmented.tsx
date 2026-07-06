import React from "react";
import { Select } from "@dynatrace/strato-components/forms";
import {
  SAMPLING_LABELS,
  SAMPLING_RATIOS,
  useSampling,
  type SamplingRatio,
} from "../scope/SamplingContext";

/**
 * Compact dropdown for the global samplingRatio setting. Switched from a
 * segmented control to a Select so it stays visible in narrow toolbars.
 */
export const SamplingSegmented = () => {
  const { samplingRatio, setSamplingRatio } = useSampling();
  return (
    <div style={{ minWidth: 90 }}>
      <Select<string>
        name="sampling-ratio"
        value={String(samplingRatio)}
        onChange={(v) => {
          if (!v) return;
          const next = Number(v) as SamplingRatio;
          if (SAMPLING_RATIOS.includes(next)) setSamplingRatio(next);
        }}
      >
        <Select.Trigger
          placeholder={SAMPLING_LABELS[samplingRatio]}
          aria-label="Sampling ratio"
        />
        <Select.Content>
          {SAMPLING_RATIOS.map((value) => {
            // Point-of-choice fidelity cue on the endpoints (scan-1): None is
            // exact but scans the most; the top ratio is cheapest but roughest.
            const note =
              value === 1
                ? " · exact"
                : value === SAMPLING_RATIOS[SAMPLING_RATIOS.length - 1]
                  ? " · roughest estimate"
                  : "";
            return (
              <Select.Option key={value} value={String(value)}>
                {value === 1
                  ? "None (every record)"
                  : `${SAMPLING_LABELS[value]} (1 in ${value})`}
                {note}
              </Select.Option>
            );
          })}
        </Select.Content>
      </Select>
    </div>
  );
};

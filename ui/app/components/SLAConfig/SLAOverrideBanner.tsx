import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { WarningIcon } from "@dynatrace/strato-icons";
import { useSLA } from "./SLAContext";
import { countActiveThresholds } from "./types";

export interface SLAOverrideBannerProps {
  onEdit: () => void;
}

/**
 * Persistent amber callout shown at the top of the Agents tab whenever any
 * custom SLA threshold is set. NOT dismissible — the user clears it by
 * resetting thresholds via the banner action.
 *
 * Copy is intentionally precise: it states that Dynatrace Intelligence is
 * still running, it's just suspended for *these metrics in this view*.
 */
export const SLAOverrideBanner = ({ onEdit }: SLAOverrideBannerProps) => {
  const { thresholds, hasActive, reset } = useSLA();
  if (!hasActive) return null;
  const n = countActiveThresholds(thresholds);

  return (
    <Flex
      alignItems="center"
      gap={12}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        background:
          "color-mix(in oklab, var(--amber) 12%, var(--surface))",
        border: "1px solid color-mix(in oklab, var(--amber) 50%, transparent)",
      }}
      role="status"
    >
      <WarningIcon size={16} style={{ color: "var(--amber)", flex: "0 0 auto" }} />
      <Text style={{ fontSize: 12.5, color: "var(--text)", flex: 1 }}>
        <strong>Custom SLA thresholds active</strong> — {n}{" "}
        {n === 1 ? "threshold" : "thresholds"} configured. Dynatrace
        Intelligence anomaly detection is suspended for these metrics within this
        view.
      </Text>
      <Button variant="default" onClick={onEdit}>
        Edit thresholds
      </Button>
      <Button variant="default" onClick={reset}>
        Reset to Intelligence
      </Button>
    </Flex>
  );
};

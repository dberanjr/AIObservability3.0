import React, { useEffect, useState } from "react";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { NumberInputV2 } from "@dynatrace/strato-components/forms";
import { WarningIcon } from "@dynatrace/strato-icons";
import { useSLA } from "./SLAContext";
import {
  EMPTY_THRESHOLDS,
  SLA_METRIC_ATTRS,
  SLA_METRIC_LABELS,
  SLA_METRIC_UNITS,
  type SLAMetric,
  type SLAThresholds,
} from "./types";

export interface SuggestedThresholds {
  p90Ms?: number;
  p99Ms?: number;
  maxErrorRatePct?: number;
  maxCostPerInvocation?: number;
  maxTtftMs?: number;
}

const METRIC_ORDER: SLAMetric[] = [
  "p90Ms",
  "p99Ms",
  "maxErrorRatePct",
  "maxCostPerInvocation",
  "maxTtftMs",
];

interface FieldProps {
  metric: SLAMetric;
  value: number | null;
  onChange: (next: number | null) => void;
  suggested?: number;
  disabled?: boolean;
  hint?: string;
}

const Field = ({
  metric,
  value,
  onChange,
  suggested,
  disabled,
  hint,
}: FieldProps) => (
  <Flex flexDirection="column" gap={4}>
    <Flex alignItems="baseline" justifyContent="space-between">
      <Text style={{ fontSize: 12.5, fontWeight: 600 }}>
        {SLA_METRIC_LABELS[metric]}{" "}
        <Text as="span" style={{ color: "var(--text-3)", fontWeight: 400 }}>
          ({SLA_METRIC_UNITS[metric]})
        </Text>
      </Text>
      {suggested != null && (
        <Button
          variant="default"
          disabled={disabled}
          onClick={() => onChange(suggested)}
        >
          Use suggested ({suggested})
        </Button>
      )}
    </Flex>
    <NumberInputV2
      name={metric}
      value={value}
      onChange={(next) => onChange(next)}
      disabled={disabled}
      placeholder={
        suggested != null ? `Suggested ${suggested}` : "Not configured"
      }
    />
    {hint && (
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        {hint}
      </Text>
    )}
    <Text
      style={{
        fontSize: 10.5,
        color: "var(--text-4)",
        fontFamily: "var(--mono, monospace)",
      }}
    >
      {SLA_METRIC_ATTRS[metric]}
    </Text>
  </Flex>
);

export interface SLAConfigDrawerProps {
  show: boolean;
  onDismiss: () => void;
  suggested?: SuggestedThresholds;
}

export const SLAConfigDrawer = ({
  show,
  onDismiss,
  suggested,
}: SLAConfigDrawerProps) => {
  const { thresholds, setThresholds, reset } = useSLA();
  const [draft, setDraft] = useState<SLAThresholds>(thresholds);

  // Re-sync the draft from context whenever the drawer (re)opens.
  useEffect(() => {
    if (show) setDraft(thresholds);
  }, [show, thresholds]);

  const setField = (metric: SLAMetric, value: number | null) =>
    setDraft((d) => ({ ...d, [metric]: value }));

  const apply = () => {
    setThresholds(draft);
    onDismiss();
  };

  const cancel = () => {
    setDraft(thresholds);
    onDismiss();
  };

  const resetIntel = () => {
    reset();
    setDraft(EMPTY_THRESHOLDS);
    onDismiss();
  };

  return (
    <Sheet
      show={show}
      onDismiss={cancel}
      title="Custom SLA Thresholds"
      aria-label="Custom SLA thresholds"
    >
      <Flex
        flexDirection="column"
        gap={16}
        style={{ width: 520, maxWidth: "100%" }}
      >
        <Flex
          alignItems="flex-start"
          gap={8}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background:
              "color-mix(in oklab, var(--amber) 12%, var(--surface))",
            border: "1px solid color-mix(in oklab, var(--amber) 50%, transparent)",
          }}
        >
          <WarningIcon
            size={16}
            style={{ color: "var(--amber)", flex: "0 0 auto", marginTop: 2 }}
          />
          <Text style={{ fontSize: 12.5, color: "var(--text)" }}>
            <strong>Custom thresholds override Dynatrace Intelligence.</strong>{" "}
            When any threshold is set here, the Intelligence-learned baseline for
            that metric is suspended within this UI. Dynatrace Intelligence
            continues running — it just won't be used for agent health scoring
            in this view.
          </Text>
        </Flex>

        <Flex flexDirection="column" gap={12}>
          {METRIC_ORDER.map((metric) => {
            const isTTFT = metric === "maxTtftMs";
            return (
              <Field
                key={metric}
                metric={metric}
                value={draft[metric]}
                onChange={(v) => setField(metric, v)}
                suggested={suggested?.[metric]}
                disabled={isTTFT}
                hint={
                  isTTFT
                    ? "Disabled until gen_ai.response.ttft is instrumented."
                    : undefined
                }
              />
            );
          })}
        </Flex>

        <Flex
          justifyContent="space-between"
          alignItems="center"
          style={{
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <Button variant="default" onClick={resetIntel}>
            Reset to Dynatrace Intelligence (disable custom thresholds)
          </Button>
          <Flex gap={8}>
            <Button variant="default" onClick={cancel}>
              Cancel
            </Button>
            <Button variant="emphasized" onClick={apply}>
              Apply thresholds
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Sheet>
  );
};

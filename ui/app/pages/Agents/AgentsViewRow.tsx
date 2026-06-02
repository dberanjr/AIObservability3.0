import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { SettingIcon, AiIcon } from "@dynatrace/strato-icons";
import { useSLA } from "../../components/SLAConfig/SLAContext";

export type AgentView = "all" | "slow" | "expensive" | "used";
/**
 * Replaces the old framework filter (gen_ai.framework has 0 rows in this
 * tenant). Operation type comes from gen_ai.operation.name on the LLM spans
 * trace-linked to each agent.
 */
export type AgentOperation = "all" | "chat" | "text_completion" | "embeddings";

const VIEW_OPTIONS: { value: AgentView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "slow", label: "Slow" },
  { value: "expensive", label: "Expensive" },
  { value: "used", label: "Most used" },
];

const OPERATION_OPTIONS: { value: AgentOperation; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chat", label: "Chat" },
  { value: "text_completion", label: "Completion" },
  { value: "embeddings", label: "Embeddings" },
];

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}

const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) => (
  <Flex alignItems="center" gap={6}>
    <Text
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-3)",
      }}
    >
      {label}
    </Text>
    <div
      role="radiogroup"
      aria-label={label}
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
            onClick={() => onChange(opt.value)}
            role="radio"
            aria-checked={active}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--text)" : "var(--text-2)",
              background: active ? "var(--surface)" : "transparent",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  </Flex>
);

export interface AgentsViewRowProps {
  view: AgentView;
  operation: AgentOperation;
  onViewChange: (v: AgentView) => void;
  onOperationChange: (f: AgentOperation) => void;
  onSetupDetector: () => void;
  onConfigureSLA: () => void;
}

export const AgentsViewRow = ({
  view,
  operation,
  onViewChange,
  onOperationChange,
  onSetupDetector,
  onConfigureSLA,
}: AgentsViewRowProps) => {
  const { hasActive } = useSLA();
  return (
    <Flex alignItems="center" gap={16} style={{ flexWrap: "wrap" }}>
      <Segmented
        label="View"
        value={view}
        options={VIEW_OPTIONS}
        onChange={onViewChange}
      />
      <Segmented
        label="Operation"
        value={operation}
        options={OPERATION_OPTIONS}
        onChange={onOperationChange}
      />
      <Flex flexGrow={1} />
      <Button variant="default" onClick={onSetupDetector}>
        <Button.Prefix>
          <AiIcon />
        </Button.Prefix>
        Setup anomaly detector
      </Button>
      <Button
        variant={hasActive ? "default" : "default"}
        onClick={onConfigureSLA}
        style={hasActive ? { color: "var(--amber)" } : undefined}
      >
        <Button.Prefix>
          <SettingIcon />
        </Button.Prefix>
        {hasActive ? "Custom SLA active" : "Configure SLA thresholds"}
      </Button>
    </Flex>
  );
};

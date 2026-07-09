import React from "react";
import { Text } from "@dynatrace/strato-components/typography";

export type BedrockSubTab = "runtime" | "governance";

const OPTIONS: { value: BedrockSubTab; label: string }[] = [
  { value: "runtime", label: "Runtime Observability & Cost & Usage" },
  { value: "governance", label: "Access & Governance" },
];

export interface BedrockSubTabsProps {
  value: BedrockSubTab;
  onChange: (next: BedrockSubTab) => void;
}

/**
 * Two-option segmented control switching the AWS Bedrock page between its
 * Runtime/Cost view and the CloudTrail Access & Governance view. Reuses the
 * app's pill `radiogroup` pattern (see Models/ModelTypeSegmented) so it reads
 * as one of the app's own controls, and keeps the whole thing inside the single
 * `/bedrock` route — no extra nav entry.
 */
export const BedrockSubTabs = ({ value, onChange }: BedrockSubTabsProps) => (
  <div
    role="radiogroup"
    aria-label="AWS Bedrock view"
    style={{
      display: "inline-flex",
      padding: 3,
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 999,
      flexWrap: "wrap",
    }}
  >
    {OPTIONS.map((opt) => {
      const active = value === opt.value;
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
            padding: "6px 16px",
            borderRadius: 999,
            border: active ? "1px solid var(--blue)" : "1px solid transparent",
            fontSize: 12.5,
            fontWeight: active ? 600 : 500,
            color: active ? "var(--text)" : "var(--text-2)",
            background: active ? "var(--surface)" : "transparent",
            boxShadow: active ? "var(--shadow, 0 1px 3px rgba(0,0,0,0.12))" : undefined,
            transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
          }}
        >
          <Text as="span" style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, color: "inherit" }}>
            {opt.label}
          </Text>
        </button>
      );
    })}
  </div>
);

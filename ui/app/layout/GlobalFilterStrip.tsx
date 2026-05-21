import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { SegmentSelector } from "@dynatrace/strato-components/filters";
import { ResetIcon } from "@dynatrace/strato-icons";
import { useScope } from "../scope/ScopeContext";
import { ResolutionStatusLine } from "./ResolutionStatusLine";
import { ScanLimitSegmented } from "./ScanLimitSegmented";
import { SamplingSegmented } from "./SamplingSegmented";

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
}

const LabeledField = ({ label, children }: LabeledFieldProps) => (
  <Flex flexDirection="column" gap={2} style={{ minWidth: 140 }}>
    <Text
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-3)",
      }}
    >
      {label}
    </Text>
    {children}
  </Flex>
);

export const GlobalFilterStrip = () => {
  const { scope, reset } = useScope();

  const isDefaultScope =
    scope.timeframe.from === "now()-24h" && !scope.timeframe.to;

  return (
    <Flex
      flexDirection="column"
      style={{
        background:
          "linear-gradient(90deg, rgba(28, 91, 229, 0.04), rgba(178, 59, 228, 0.02))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Flex
        gap={12}
        alignItems="flex-end"
        style={{
          padding: "8px 20px",
          minHeight: 48,
          flexWrap: "wrap",
        }}
      >
        <LabeledField label="Segments">
          <SegmentSelector variant="compact" />
        </LabeledField>

        <Flex flexGrow={1} style={{ minWidth: 0 }} />

        <LabeledField label="Sampling">
          <SamplingSegmented />
        </LabeledField>

        <LabeledField label="Scan limit">
          <ScanLimitSegmented />
        </LabeledField>

        <Button
          variant="default"
          onClick={reset}
          disabled={isDefaultScope}
          aria-label="Reset filters"
        >
          <Button.Prefix>
            <ResetIcon />
          </Button.Prefix>
          Reset
        </Button>
      </Flex>
      <ResolutionStatusLine />
    </Flex>
  );
};

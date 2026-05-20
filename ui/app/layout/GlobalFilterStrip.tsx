import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Select } from "@dynatrace/strato-components/forms";
import { ResetIcon } from "@dynatrace/strato-icons";
import { useScope } from "../scope/ScopeContext";
import { useAppCiOptions } from "../scope/useAppCiOptions";
import { useApplicationOptions } from "../scope/useApplicationOptions";
import { ENV_OPTIONS, TIME_PRESETS } from "../scope/types";
import { ResolutionStatusLine } from "./ResolutionStatusLine";
import { ScanLimitSegmented } from "./ScanLimitSegmented";

const ALL_APPLICATIONS = "__all__";
const ALL_ENVS = "__all__";

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
}

const LabeledField = ({ label, children }: LabeledFieldProps) => (
  <Flex flexDirection="column" gap={2} style={{ minWidth: 160 }}>
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
  const { scope, setAppCi, setApplication, setEnv, setTimeframe, reset } =
    useScope();
  const { options: appCiOptions, isLoading: appCiLoading } = useAppCiOptions();
  const { options: applicationOptions, isLoading: applicationLoading } =
    useApplicationOptions(scope.appCi);

  const isDefaultScope =
    !scope.appCi &&
    !scope.application &&
    !scope.env &&
    scope.timeframe.from === "now()-24h";

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
        gap={16}
        alignItems="flex-end"
        style={{ padding: "8px 20px", minHeight: 48 }}
      >
        <LabeledField label="AppCI">
          <Select<string>
            name="appCi"
            value={scope.appCi ?? null}
            onChange={(v) => setAppCi(v ?? undefined)}
            clearable
          >
            <Select.Trigger
              placeholder={appCiLoading ? "Loading..." : "Select AppCI"}
            />
            <Select.Content>
              {appCiOptions.map((ci) => (
                <Select.Option key={ci} value={ci}>
                  {ci}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </LabeledField>

        <LabeledField label="Application">
          <Select<string>
            name="application"
            value={scope.application ?? ALL_APPLICATIONS}
            onChange={(v) =>
              setApplication(v === ALL_APPLICATIONS ? undefined : v ?? undefined)
            }
            disabled={!scope.appCi}
          >
            <Select.Trigger
              placeholder={
                !scope.appCi
                  ? "Select AppCI first"
                  : applicationLoading
                    ? "Loading..."
                    : `All applications under ${scope.appCi}`
              }
            />
            <Select.Content>
              <Select.Option value={ALL_APPLICATIONS}>
                {scope.appCi
                  ? `All applications under ${scope.appCi}`
                  : "All"}
              </Select.Option>
              {applicationOptions.map((label) => (
                <Select.Option key={label} value={label}>
                  {label}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </LabeledField>

        <LabeledField label="Env">
          <Select<string>
            name="env"
            value={scope.env ?? ALL_ENVS}
            onChange={(v) =>
              setEnv(v === ALL_ENVS ? undefined : v ?? undefined)
            }
          >
            <Select.Trigger placeholder="All envs" />
            <Select.Content>
              <Select.Option value={ALL_ENVS}>All envs</Select.Option>
              {ENV_OPTIONS.map((env) => (
                <Select.Option key={env} value={env}>
                  {env}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </LabeledField>

        <LabeledField label="Time">
          <Select<string>
            name="time"
            value={scope.timeframe.from}
            onChange={(v) => v && setTimeframe({ from: v })}
          >
            <Select.Trigger placeholder="Timeframe" />
            <Select.Content>
              {TIME_PRESETS.map((preset) => (
                <Select.Option key={preset.value} value={preset.value}>
                  {preset.label}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </LabeledField>

        <Flex flexGrow={1} />

        <ScanLimitSegmented />

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

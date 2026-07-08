import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useScope } from "../../scope/ScopeContext";
import { EmptyState } from "../../components/EmptyState";
import { useBedrockAvailable, useBedrockOverview } from "../../bedrock/useBedrock";
import type { BedrockScope } from "../../bedrock/types";
import { fmtCount } from "../../data/format";
import { BedrockHero } from "./BedrockHero";
import { BedrockKpiRow } from "./BedrockKpiRow";

/**
 * AWS Bedrock page shell (D1). Gates the whole page on a cheap existence
 * probe (any `/aws/bedrock/model-invocations` log in the last 24h — see
 * useBedrockAvailable) so a tenant with no Bedrock integration sees an
 * explicit "no-instrumentation" EmptyState — the app's convention for gating
 * an entire view on absent data (see CapabilityGate's default fallback and
 * GuardrailsPanel) — instead of a silently-empty page. Account/model
 * selectors are wired in a later step (D6); scope carries empty arrays
 * (= "all") until then. Zones D2–D7 mount below the header, each receiving
 * `scope`.
 */
export const BedrockPage = () => {
  const { scope: appScope } = useScope();
  // Setters are unused until D6 wires the Account/Model selectors that call
  // them; kept here (rather than plain constants) so that step is a pure
  // addition with no page-level state to introduce.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const [accounts, setAccounts] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const scope: BedrockScope = useMemo(
    () => ({ timeframe: appScope.timeframe, accounts, models }),
    [appScope.timeframe, accounts, models],
  );

  const { available, isLoading: probing } = useBedrockAvailable();
  const overview = useBedrockOverview(scope);

  if (!probing && !available) {
    return (
      <Flex
        flexDirection="column"
        gap={16}
        style={{ padding: "18px 20px 80px" }}
      >
        <Flex flexDirection="column" gap={2}>
          <Heading level={1} style={{ fontSize: 18, fontWeight: 700 }}>
            AWS Bedrock
          </Heading>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
            Model-invocation logging, cost, agent sessions, and performance for
            Amazon Bedrock.
          </Text>
        </Flex>
        <EmptyState
          cause="no-instrumentation"
          title="No AWS Bedrock telemetry found"
          description="This page reads /aws/bedrock/model-invocations logs and cloud.aws.bedrock.* metrics — neither was found in the current timeframe."
          hint="Confirm the AWS→Dynatrace integration is delivering Bedrock logs and metrics: enable model-invocation logging to CloudWatch Logs and forward the /aws/bedrock/model-invocations log group and cloud.aws.bedrock.* namespace for the account(s) in scope."
          actions={[
            {
              label: "AWS Bedrock invocation logging",
              href: "https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html",
            },
          ]}
        />
      </Flex>
    );
  }

  return (
    <Flex
      flexDirection="column"
      gap={16}
      style={{ padding: "18px 20px 80px" }}
    >
      <Flex justifyContent="space-between" alignItems="center">
        <Flex flexDirection="column" gap={2}>
          <Heading level={1} style={{ fontSize: 18, fontWeight: 700 }}>
            AWS Bedrock
          </Heading>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
            {fmtCount(overview.totals.invocations)} invocations ·{" "}
            {fmtCount(overview.totals.accounts)} accounts ·{" "}
            {fmtCount(overview.totals.models)} models ·{" "}
            {fmtCount(overview.totals.sessions)} sessions · source: Logs + Metrics
          </Text>
        </Flex>
        {/* Scope selectors (Account, Model) wired in D6 — setAccounts/setModels. */}
      </Flex>
      <BedrockHero scope={scope} />
      <BedrockKpiRow scope={scope} />
      {/* Zones D4–D7 mount here, each receiving `scope`. */}
    </Flex>
  );
};

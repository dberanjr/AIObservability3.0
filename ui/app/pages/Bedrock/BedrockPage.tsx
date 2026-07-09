import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useScope } from "../../scope/ScopeContext";
import { EmptyState } from "../../components/EmptyState";
import { useBedrockAvailable } from "../../bedrock/useBedrock";
import type { BedrockScope } from "../../bedrock/types";
import type { GovScope } from "../../bedrock/governance/types";
import { ScopeSelectors } from "./ScopeSelectors";
import { BedrockSubTabs, type BedrockSubTab } from "./BedrockSubTabs";
import { BedrockRuntimeView } from "./BedrockRuntimeView";
import { BedrockGovernanceView } from "./BedrockGovernanceView";

const isSubTab = (v: string | null): v is BedrockSubTab =>
  v === "runtime" || v === "governance";

/**
 * AWS Bedrock page shell. Gates the whole page on a cheap existence probe (any
 * `/aws/bedrock/model-invocations` log in the last 24h — see useBedrockAvailable)
 * so a tenant with no Bedrock integration sees an explicit "no-instrumentation"
 * EmptyState instead of a silently-empty page.
 *
 * Two sub-tabs live inside this one `/bedrock` route (no extra nav entry):
 * Runtime Observability & Cost & Usage (default) and Access & Governance
 * (CloudTrail). The active tab is mirrored to the `?view=` URL param so it
 * deep-links. Account + timeframe are shared across both tabs; the Model
 * selector shows only on the Runtime tab (CloudTrail has no model dimension).
 */
export const BedrockPage = () => {
  const { scope: appScope } = useScope();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const view: BedrockSubTab = isSubTab(searchParams.get("view"))
    ? (searchParams.get("view") as BedrockSubTab)
    : "runtime";
  const setView = (next: BedrockSubTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "runtime") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: true });
  };

  const scope: BedrockScope = useMemo(
    () => ({ timeframe: appScope.timeframe, accounts, models }),
    [appScope.timeframe, accounts, models],
  );
  const govScope: GovScope = useMemo(
    () => ({ timeframe: appScope.timeframe, accounts }),
    [appScope.timeframe, accounts],
  );

  const { available, isLoading: probing } = useBedrockAvailable();

  if (!probing && !available) {
    return (
      <Flex flexDirection="column" gap={16} style={{ padding: "18px 20px 80px" }}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={1} style={{ fontSize: 18, fontWeight: 700 }}>
            AWS Bedrock
          </Heading>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
            Model-invocation logging, cost, agent sessions, performance, and access
            governance for Amazon Bedrock.
          </Text>
        </Flex>
        <EmptyState
          cause="no-instrumentation"
          title="No AWS Bedrock telemetry found"
          description="This page reads /aws/bedrock/model-invocations logs, cloud.aws.bedrock.* metrics, and Bedrock CloudTrail events — none was found in the current timeframe."
          hint="Confirm the AWS→Dynatrace integration is delivering Bedrock logs, metrics and CloudTrail: enable model-invocation logging to CloudWatch Logs and forward the /aws/bedrock/model-invocations log group, the cloud.aws.bedrock.* namespace, and CloudTrail management/data events for the account(s) in scope."
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
    <Flex flexDirection="column" gap={16} style={{ padding: "18px 20px 80px" }}>
      <Flex justifyContent="space-between" alignItems="flex-start" gap={16} style={{ flexWrap: "wrap" }}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={1} style={{ fontSize: 18, fontWeight: 700 }}>
            AWS Bedrock
          </Heading>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
            {view === "runtime"
              ? "Model usage, cost, agent sessions, throughput and latency."
              : "Identity, access, data-residency and audit — from Bedrock CloudTrail events."}
          </Text>
        </Flex>
        <ScopeSelectors
          timeframe={appScope.timeframe}
          accounts={accounts}
          models={models}
          setAccounts={setAccounts}
          setModels={setModels}
          showModel={view === "runtime"}
        />
      </Flex>

      <BedrockSubTabs value={view} onChange={setView} />

      {view === "runtime" ? (
        <BedrockRuntimeView scope={scope} />
      ) : (
        <BedrockGovernanceView scope={govScope} />
      )}
    </Flex>
  );
};

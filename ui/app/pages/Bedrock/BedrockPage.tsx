import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { useScope } from "../../scope/ScopeContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { ExampleDataNotice } from "../../components/ExampleDataNotice";
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
 * AWS Bedrock page shell. Two sub-tabs live inside this one `/bedrock` route
 * (no extra nav entry): Runtime Observability & Cost & Usage (default) and
 * Access & Governance (CloudTrail). The active tab is mirrored to the
 * `?view=` URL param so it deep-links. Account + timeframe are shared across
 * both tabs; the Model selector shows only on the Runtime tab (CloudTrail has
 * no model dimension).
 *
 * Demo Mode: the page never blocks on a full-page "no telemetry" EmptyState
 * anymore. `useBedrockAvailable` probes for any Bedrock log activity in the
 * SAME timeframe every other query on this page uses (previously hardcoded to
 * a rolling 24h, which could false-negative against an older selected
 * window). `showExample` is true when the global Demo Mode Tweak is on, OR
 * once that probe resolves to "nothing found" — either way every section
 * renders its bundled demo dataset instead, with a small notice in the
 * automatic (non-Tweak) case.
 */
export const BedrockPage = () => {
  const { scope: appScope } = useScope();
  const { pageConfig } = useTweaks();
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

  // Only treat "no telemetry" as true once the probe has actually resolved —
  // otherwise the page would flash example data for a moment on load.
  const { available, isLoading: probing } = useBedrockAvailable(appScope.timeframe);
  const showExample = pageConfig.demoMode || (!probing && !available);

  const scope: BedrockScope = useMemo(
    () => ({ timeframe: appScope.timeframe, accounts, models, showExample }),
    [appScope.timeframe, accounts, models, showExample],
  );
  const govScope: GovScope = useMemo(
    () => ({ timeframe: appScope.timeframe, accounts, showExample }),
    [appScope.timeframe, accounts, showExample],
  );

  return (
    <Flex flexDirection="column" gap={16} style={{ padding: "18px 20px 80px" }}>
      {showExample && !pageConfig.demoMode && <ExampleDataNotice tabLabel="AWS Bedrock" />}
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
          showExample={showExample}
        />
      </Flex>

      <BedrockSubTabs value={view} onChange={setView} />

      {probing && !pageConfig.demoMode ? (
        <Skeleton style={{ height: 120, borderRadius: 8 }} />
      ) : view === "runtime" ? (
        <BedrockRuntimeView scope={scope} />
      ) : (
        <BedrockGovernanceView scope={govScope} />
      )}
    </Flex>
  );
};

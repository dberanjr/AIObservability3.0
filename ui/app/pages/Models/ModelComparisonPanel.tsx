import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { ComparisonCard } from "./ComparisonCard";
import { IntelligenceRecommendationPanel } from "./IntelligenceRecommendationPanel";
import {
  USE_CASE_PROFILES,
  compareModels,
  findProfile,
  type UseCaseProfile,
} from "./scoring";
import type { ModelRow } from "./useModels";

const ACCENT_A = "var(--blue)";
const ACCENT_B = "var(--purple)";

const UpstreamBand = ({ profile }: { profile: UseCaseProfile }) => (
  <Flex
    alignItems="center"
    gap={12}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      flexWrap: "wrap",
    }}
  >
    <Flex flexDirection="column" gap={2} style={{ flex: 1, minWidth: 220 }}>
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Driving upstream service
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "var(--mono, monospace)",
        }}
      >
        {profile.upstreamService}
      </Text>
      <Text style={{ fontSize: 12, color: "var(--text-2)" }}>
        {profile.description} · min quality:{" "}
        <strong>{profile.minQuality}</strong>
      </Text>
    </Flex>
    <Flex gap={6} style={{ flexWrap: "wrap" }}>
      {(["latency", "cost", "quality", "throughput", "reliability"] as const).map(
        (k) => (
          <span
            key={k}
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--text-2)",
            }}
          >
            <span style={{ textTransform: "capitalize" }}>{k}</span>{" "}
            <span
              style={{
                fontWeight: 600,
                color: "var(--text)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {profile.weights[k]}
            </span>
          </span>
        ),
      )}
    </Flex>
  </Flex>
);

const pickInitial = (models: ModelRow[]): [string | null, string | null] => {
  if (models.length === 0) return [null, null];
  const sorted = [...models].sort((a, b) => b.requests - a.requests);
  return [sorted[0]?.modelKey ?? null, sorted[1]?.modelKey ?? sorted[0]?.modelKey ?? null];
};

const upstreamFor = (profile: UseCaseProfile, fallback: string[]): string[] => {
  // Lead with the profile's named upstream, then merge any extra observed names.
  const seen = new Set<string>([profile.upstreamService]);
  const out = [profile.upstreamService];
  for (const s of fallback) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
};

export interface ModelComparisonPanelProps {
  models: ModelRow[];
  /** Upstream services observed in the current scope (best-effort context). */
  observedUpstream: string[];
  /** Total fleet requests over the scope timeframe — used to project savings. */
  monthlyRequests: number;
}

export const ModelComparisonPanel = ({
  models,
  observedUpstream,
  monthlyRequests,
}: ModelComparisonPanelProps) => {
  const [profileId, setProfileId] = useState<string>(
    USE_CASE_PROFILES[0]?.id ?? "rag-qna",
  );
  const profile = findProfile(profileId);

  const eligibleModels = useMemo(
    () => models.filter((m) => m.type === "generative" && !m.pricingUnknown),
    [models],
  );

  const [aKey, bKey] = useMemo(
    () => pickInitial(eligibleModels),
    [eligibleModels],
  );
  const [aSelected, setASelected] = useState<string | null>(aKey);
  const [bSelected, setBSelected] = useState<string | null>(bKey);

  // Re-sync selections when the eligible set changes (e.g. scope swap).
  React.useEffect(() => {
    if (!aSelected || !eligibleModels.find((m) => m.modelKey === aSelected)) {
      setASelected(aKey);
    }
    if (!bSelected || !eligibleModels.find((m) => m.modelKey === bSelected)) {
      setBSelected(bKey);
    }
  }, [aKey, bKey, eligibleModels, aSelected, bSelected]);

  const modelA = eligibleModels.find((m) => m.modelKey === aSelected) ?? null;
  const modelB = eligibleModels.find((m) => m.modelKey === bSelected) ?? null;

  const upstream = useMemo(
    () => upstreamFor(profile, observedUpstream),
    [profile, observedUpstream],
  );

  const result = useMemo(() => {
    if (!modelA || !modelB) return null;
    const aCostPerReq =
      modelA.requests > 0 ? modelA.cost / modelA.requests : 0;
    const bCostPerReq =
      modelB.requests > 0 ? modelB.cost / modelB.requests : 0;
    return compareModels(
      profile,
      {
        model: modelA.model,
        avgMs: modelA.avgMs,
        costPerRequest: aCostPerReq,
        requests: modelA.requests,
        errorRatePct: modelA.errorRatePct,
        pricing: {
          inputPerMTok: 0,
          outputPerMTok: 0,
          contextWindow: null,
          provider: modelA.provider.label,
          tier: getTier(modelA),
        },
      },
      {
        model: modelB.model,
        avgMs: modelB.avgMs,
        costPerRequest: bCostPerReq,
        requests: modelB.requests,
        errorRatePct: modelB.errorRatePct,
        pricing: {
          inputPerMTok: 0,
          outputPerMTok: 0,
          contextWindow: null,
          provider: modelB.provider.label,
          tier: getTier(modelB),
        },
      },
      monthlyRequests,
    );
  }, [profile, modelA, modelB, monthlyRequests]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex alignItems="baseline" justifyContent="space-between" gap={12}>
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Model A vs B comparison
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Scored against the selected use case profile
            </Text>
          </Flex>
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
              Use case
            </Text>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                fontSize: 12.5,
                color: "var(--text)",
              }}
            >
              {USE_CASE_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Flex>
        </Flex>

        <UpstreamBand profile={profile} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 12,
          }}
        >
          <ComparisonCard
            card="A"
            model={modelA}
            options={eligibleModels}
            onSelect={setASelected}
            upstreamServices={upstream}
            isWinner={result?.winner === "a"}
            accent={ACCENT_A}
            weightedScore={result ? result.a.weightedTotal : null}
            disqualifiedReason={result?.a.disqualifiedReason}
          />
          <ComparisonCard
            card="B"
            model={modelB}
            options={eligibleModels}
            onSelect={setBSelected}
            upstreamServices={upstream}
            isWinner={result?.winner === "b"}
            accent={ACCENT_B}
            weightedScore={result ? result.b.weightedTotal : null}
            disqualifiedReason={result?.b.disqualifiedReason}
          />
        </div>

        {result ? (
          <IntelligenceRecommendationPanel result={result} />
        ) : (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            Pick two generative models with known pricing to see the
            recommendation.
          </Text>
        )}
      </Flex>
    </Surface>
  );
};

/** Pull the cached tier off pricing for a ModelRow without re-importing pricing.ts. */
const getTier = (m: ModelRow) => {
  // pricing tier is already encoded into the ModelRow via getPricing() inside
  // useModels — we re-derive here to keep the comparison panel decoupled.
  if (/opus|claude-(?:opus|sonnet-4)/i.test(m.model)) return "frontier" as const;
  if (/sonnet|gpt-4\.1|gpt-4o(?!-mini)|gemini-2\.5-pro/i.test(m.model))
    return "high" as const;
  if (/haiku|gpt-4o-mini|gemini-2\.5-flash/i.test(m.model)) return "mid" as const;
  if (/embed|embedding/i.test(m.model)) return "low" as const;
  return "mid" as const;
};

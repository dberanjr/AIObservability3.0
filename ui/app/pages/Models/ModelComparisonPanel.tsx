import React, { useEffect, useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { ComparisonCard } from "./ComparisonCard";
import { IntelligenceRecommendationPanel } from "./IntelligenceRecommendationPanel";
import {
  DIMENSIONS,
  DIMENSION_LABEL,
  USE_CASE_PROFILES,
  compareModels,
  findProfile,
  type ScoreDimension,
  type UseCaseProfile,
} from "./scoring";
import { useModels, type ModelRow } from "./useModels";
import { useScope } from "../../scope/ScopeContext";
import { THIRTY_DAYS_MS } from "../Explorer/serviceModelCost";
import { timeframeDurationMs } from "../Explorer/useServiceModelDetail";

const ACCENT_A = "var(--blue)";
const ACCENT_B = "var(--purple)";

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const selectStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  fontSize: 12.5,
  color: "var(--text)",
  maxWidth: "100%",
};

/** A labelled dropdown used for the use-case / service / upstream selectors. */
const Picker = ({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) => (
  <Flex flexDirection="column" gap={4} style={{ minWidth: 0, flex: 1 }}>
    <Text style={LABEL_STYLE}>{label}</Text>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...selectStyle, fontFamily: "var(--mono, monospace)" }}
    >
      {children}
    </select>
  </Flex>
);

/** Editable weight sliders (0–100 per dimension). Scores are weighted averages,
 *  so absolute magnitudes don't matter — only the ratios between dimensions. */
const WeightSliders = ({
  weights,
  edited,
  onChange,
  onReset,
}: {
  weights: Record<ScoreDimension, number>;
  edited?: boolean;
  onChange: (dim: ScoreDimension, value: number) => void;
  onReset: () => void;
}) => (
  <Flex flexDirection="column" gap={8}>
    <Flex alignItems="center" justifyContent="space-between">
      <Flex alignItems="center" gap={6}>
        <Text style={LABEL_STYLE}>Scoring weights</Text>
        {edited && (
          <span
            title="Weights differ from the use-case preset"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--amber)",
              background: "color-mix(in oklab, var(--amber) 16%, transparent)",
              border: "1px solid color-mix(in oklab, var(--amber) 45%, transparent)",
              borderRadius: 4,
              padding: "0 4px",
            }}
          >
            edited
          </span>
        )}
      </Flex>
      <button
        type="button"
        onClick={onReset}
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: 11,
          color: "var(--blue)",
          fontWeight: 600,
        }}
      >
        Reset to preset
      </button>
    </Flex>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "8px 20px",
      }}
    >
      {DIMENSIONS.map((dim) => (
        <Flex key={dim} alignItems="center" gap={8}>
          <Text
            style={{
              fontSize: 11.5,
              color: "var(--text-2)",
              width: 96,
              flex: "0 0 auto",
            }}
          >
            {DIMENSION_LABEL[dim]}
          </Text>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={weights[dim]}
            onChange={(e) => onChange(dim, Number(e.target.value))}
            style={{ flex: 1, minWidth: 0, accentColor: "var(--blue)" }}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              width: 26,
              textAlign: "right",
              flex: "0 0 auto",
            }}
          >
            {weights[dim]}
          </Text>
        </Flex>
      ))}
    </div>
  </Flex>
);

const UpstreamBand = ({
  profile,
  upstream,
}: {
  profile: UseCaseProfile;
  upstream: string;
}) => (
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
        Typical caller for this profile · context only
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "var(--mono, monospace)",
          color: "var(--text-2)",
        }}
      >
        {upstream || "—"}
      </Text>
      <Text style={{ fontSize: 12, color: "var(--text-2)" }}>
        {profile.description} · min quality:{" "}
        <strong>{profile.minQuality}</strong>
      </Text>
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        For context only — the scored metrics below reflect the service being
        compared, not this caller.
      </Text>
    </Flex>
  </Flex>
);

const pickInitial = (models: ModelRow[]): [string | null, string | null] => {
  if (models.length === 0) return [null, null];
  const sorted = [...models].sort((a, b) => b.requests - a.requests);
  return [
    sorted[0]?.modelKey ?? null,
    sorted[1]?.modelKey ?? sorted[0]?.modelKey ?? null,
  ];
};

export interface ModelComparisonPanelProps {
  /** AI service names for the "service being compared" dropdown. */
  services: string[];
  /** Detected upstream caller services for the "driving upstream" dropdown. */
  upstreamOptions: string[];
  /** Render the canned Demo Mode dataset instead of querying Grail — see
   *  `useModels`'s `showExample` param. Note the demo dataset has no
   *  per-service breakdown, so the "service being compared" selector doesn't
   *  narrow the scored metrics while this is on. */
  showExample?: boolean;
}

export const ModelComparisonPanel = ({
  services,
  upstreamOptions,
  showExample = false,
}: ModelComparisonPanelProps) => {
  const { scope } = useScope();
  const [profileId, setProfileId] = useState<string>(
    USE_CASE_PROFILES[0]?.id ?? "rag-qna",
  );
  const profile = findProfile(profileId);

  // "Service being compared" — empty = whole fleet. Scoped metrics come from a
  // service-filtered useModels query so latency/cost/errors reflect that
  // service's actual traffic.
  const [selectedService, setSelectedService] = useState<string>("");
  const { models, isLoading } = useModels(selectedService || undefined, showExample);

  // Editable weights, seeded from the profile. Switching the use case discards
  // edits, but only after an explicit confirm (see handleProfileChange) so an
  // incidental dropdown change can't silently wipe carefully tuned sliders.
  const [weights, setWeights] = useState<Record<ScoreDimension, number>>(
    profile.weights,
  );
  const weightsEdited = useMemo(
    () => DIMENSIONS.some((d) => weights[d] !== profile.weights[d]),
    [weights, profile],
  );

  const handleProfileChange = (nextId: string) => {
    if (
      weightsEdited &&
      !window.confirm(
        "Switching the use case will discard your edited scoring weights. Continue?",
      )
    ) {
      return;
    }
    setProfileId(nextId);
    setWeights(findProfile(nextId).weights);
  };

  // Driving upstream service — seeded from the profile, overridable. Reset to
  // the profile's named upstream when the profile changes.
  const [selectedUpstream, setSelectedUpstream] = useState<string>(
    profile.upstreamService,
  );
  useEffect(() => {
    setSelectedUpstream(findProfile(profileId).upstreamService);
  }, [profileId]);

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

  // Re-sync selections when the eligible set changes (scope/service swap).
  useEffect(() => {
    if (!aSelected || !eligibleModels.find((m) => m.modelKey === aSelected)) {
      setASelected(aKey);
    }
    if (!bSelected || !eligibleModels.find((m) => m.modelKey === bSelected)) {
      setBSelected(bKey);
    }
  }, [aKey, bKey, eligibleModels, aSelected, bSelected]);

  const modelA = eligibleModels.find((m) => m.modelKey === aSelected) ?? null;
  const modelB = eligibleModels.find((m) => m.modelKey === bSelected) ?? null;

  // Project the in-scope generative volume to a 30-day month for savings.
  const monthlyRequests = useMemo(() => {
    const reqs = eligibleModels.reduce((acc, m) => acc + m.requests, 0);
    if (reqs === 0) return 0;
    const tfMs = timeframeDurationMs(scope.timeframe.from, scope.timeframe.to);
    if (tfMs <= 0) return reqs;
    return Math.round(reqs * (THIRTY_DAYS_MS / tfMs));
  }, [eligibleModels, scope.timeframe]);

  const upstreamChips = useMemo(
    () => (selectedUpstream ? [selectedUpstream] : upstreamOptions.slice(0, 4)),
    [selectedUpstream, upstreamOptions],
  );

  const result = useMemo(() => {
    if (!modelA || !modelB) return null;
    const aCostPerReq =
      modelA.requests > 0 ? modelA.cost / modelA.requests : 0;
    const bCostPerReq =
      modelB.requests > 0 ? modelB.cost / modelB.requests : 0;
    // Apply the user's edited weights on top of the profile.
    const weightedProfile: UseCaseProfile = { ...profile, weights };
    return compareModels(
      weightedProfile,
      {
        model: modelA.model,
        avgMs: modelA.avgMs,
        costPerRequest: aCostPerReq,
        requests: modelA.requests,
        errorRatePct: modelA.errorRatePct,
        pricing: modelA.pricing,
      },
      {
        model: modelB.model,
        avgMs: modelB.avgMs,
        costPerRequest: bCostPerReq,
        requests: modelB.requests,
        errorRatePct: modelB.errorRatePct,
        pricing: modelB.pricing,
      },
      monthlyRequests,
    );
  }, [profile, weights, modelA, modelB, monthlyRequests]);

  const scopeLabel = selectedService
    ? `metrics scoped to ${selectedService}`
    : "metrics across the whole fleet";

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Model A vs B comparison
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Scored against the use case profile and weights · {scopeLabel}
          </Text>
        </Flex>

        {/* Selectors: use case · service being compared · driving upstream */}
        <Flex gap={12} style={{ flexWrap: "wrap" }}>
          <Picker label="Use case" value={profileId} onChange={handleProfileChange}>
            {USE_CASE_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Picker>
          <Picker
            label="Service being compared"
            value={selectedService}
            onChange={setSelectedService}
          >
            <option value="">All services (fleet)</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Picker>
          <Picker
            label="Typical caller (context only)"
            value={selectedUpstream}
            onChange={setSelectedUpstream}
          >
            {/* Keep the profile's named upstream selectable even if topology
                hasn't surfaced it as a caller. */}
            {!upstreamOptions.includes(selectedUpstream) && selectedUpstream && (
              <option value={selectedUpstream}>{selectedUpstream}</option>
            )}
            {upstreamOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Picker>
        </Flex>

        <UpstreamBand profile={profile} upstream={selectedUpstream} />

        <WeightSliders
          weights={weights}
          edited={weightsEdited}
          onChange={(dim, value) =>
            setWeights((w) => ({ ...w, [dim]: value }))
          }
          onReset={() => setWeights(findProfile(profileId).weights)}
        />

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
            upstreamServices={upstreamChips}
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
            upstreamServices={upstreamChips}
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
            {isLoading
              ? "Loading models…"
              : "Pick two generative models with known pricing to see the recommendation."}
          </Text>
        )}
      </Flex>
    </Surface>
  );
};

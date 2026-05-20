/**
 * Shared SLA configuration module.
 *
 * Pattern: Dynatrace Intelligence supplies the baseline by default; users can
 * override per-metric with custom static thresholds. While custom thresholds
 * are active the SLAOverrideBanner explains that Intelligence is suspended
 * for those metrics in this view (not platform-wide), and downstream tables /
 * panels color rows + render badges based on the breach state.
 *
 * Adopted by the Agents tab in Session 7; extracted in Session 13 so other
 * tabs (Tools, Models, Prompts) can drop the same control surface in.
 */
export {
  SLAProvider,
  useSLA,
  type SLAContextValue,
} from "./SLAContext";

export {
  EMPTY_THRESHOLDS,
  SLA_METRIC_ATTRS,
  SLA_METRIC_LABELS,
  SLA_METRIC_UNITS,
  countActiveThresholds,
  hasAnyThreshold,
  type DegradedTrendItem,
  type SLAMetric,
  type SLAThresholds,
} from "./types";

export {
  agentHealthScore,
  type AgentHealthInput,
  type AgentHealthScore,
  type AgentHealthStatus,
} from "./agentHealthScore";

export { SLAOverrideBanner } from "./SLAOverrideBanner";
export {
  SLAConfigDrawer,
  type SuggestedThresholds,
} from "./SLAConfigDrawer";
export {
  IntelligenceDetectorDrawer,
  type DetectorSuggestion,
} from "./IntelligenceDetectorDrawer";
export {
  DegradedTrendPanel,
  type DegradedTrendPanelProps,
} from "./DegradedTrendPanel";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePersistedState } from "../state/usePersistedState";

export type Theme = "light" | "dark";
export type Accent =
  | "blue"
  | "purple"
  | "cyan"
  | "green"
  | "pink"
  | "amber"
  | "red"
  | "indigo"
  | "lime"
  | "teal"
  | "purpleDeep"
  | "gray25"
  | "gray50"
  | "gray75"
  | "black"
  | "custom";
export type ChartStyle = "line" | "area" | "gradient";
/** Linear (straight segments) or smooth (cubic Bezier) line interpolation. */
export type ChartCurve = "linear" | "smooth";
/** Which data points get an inline value label drawn on the chart. */
export type ChartLabels =
  | "none"
  | "peak"
  | "minmax"
  | "interesting"
  | "all";
/** Color-blindness simulation. Renders the whole app through an SVG color
 * matrix matching the named deficiency. */
export type ColorBlindFilter =
  | "none"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

/**
 * How the Tools tab defines a "tool". The BOS tenant barely emits
 * gen_ai.tool.name (≈139 of 43B spans), so the strict OTel definition leaves
 * the tab near-empty. "discovered" instead treats internal/MCP function spans
 * (grouped by span.name) as tools. Default is "strict" per product decision.
 */
export type ToolsMode = "strict" | "discovered";

/**
 * DORMANT. The global filter previously resolved matching trace.ids and capped
 * the injected set with this knob; it now applies conditions via DIRECT per-span
 * injection (`injectGlobalFilters`), which is uncapped and exact, so nothing
 * reads `traceMatchCap` / `TRACE_MATCH_CAPS` anymore. Retained only to keep the
 * persisted pageConfig shape stable (no migration); the Tweaks UI control was
 * removed. Safe to delete once a config migration is in place.
 */
export type TraceMatchCap = "fast" | "balanced" | "exact";

/** Dormant — see TraceMatchCap. `Infinity` = no cap. */
export const TRACE_MATCH_CAPS: Record<TraceMatchCap, number> = {
  fast: 5000,
  balanced: 25000,
  exact: Infinity,
};

/**
 * Per-tab custom configuration. Extensible: add a key here and a control in
 * the Tweaks panel's "Page configuration" section for any future per-tab knob.
 */
export interface PageConfig {
  /** Tools tab: which span signal counts as a "tool". */
  toolsMode: ToolsMode;
  /**
   * Agents tab: show the TTFT column. Off by default because
   * gen_ai.response.ttft is not instrumented in BOS (0 rows).
   */
  agentsShowTtft: boolean;
  /**
   * App-wide: render capability-gated panels with EXAMPLE data when the tenant
   * doesn't emit the required attribute, so users can see what they're missing.
   * Off by default (real data only).
   */
  showExampleData: boolean;
  /**
   * App-wide: show the RAW model string (e.g. us.anthropic.claude-…-v1:0)
   * instead of the normalized label. Off by default (normalized everywhere).
   */
  showRawModels: boolean;
  /** App-wide: how aggressively to cap the global filter's trace-id set. */
  traceMatchCap: TraceMatchCap;
  /**
   * App-wide: surface per-query scan diagnostics (bytes scanned + response
   * time) next to each data element, plus a page-wide scan total. Off by
   * default — it's a debugging aid, not a default view.
   */
  showScanDebug: boolean;
  /**
   * App-wide: when enabled, restrict every span query to the named Grail
   * buckets (OR) to prune scan cost by not scanning the default span bucket.
   * `bucketFilterText` is a comma-separated list, preserved even while disabled
   * so the user's chosen buckets aren't lost when they toggle it off.
   */
  bucketFilterEnabled: boolean;
  bucketFilterText: string;
}

export interface TweaksState {
  theme: Theme;
  accent: Accent;
  /** Hex color stored for the "custom" accent — preserved across toggles. */
  customAccent: string;
  chartStyle: ChartStyle;
  chartCurve: ChartCurve;
  chartLabels: ChartLabels;
  colorBlindFilter: ColorBlindFilter;
  /** Per-tab custom configuration (see PageConfig). */
  pageConfig: PageConfig;
}

export const DEFAULT_TWEAKS: TweaksState = {
  theme: "light",
  accent: "blue",
  customAccent: "#1C5BE5",
  chartStyle: "area",
  chartCurve: "linear",
  chartLabels: "none",
  colorBlindFilter: "none",
  pageConfig: {
    // Discovered by default: gen_ai.tool.name is absent on real fleets, so
    // counting MCP / internal function spans by name is the useful default.
    toolsMode: "discovered",
    agentsShowTtft: false,
    showExampleData: false,
    showRawModels: false,
    traceMatchCap: "balanced",
    showScanDebug: false,
    bucketFilterEnabled: false,
    bucketFilterText: "",
  },
};

export interface TweaksContextValue extends TweaksState {
  setTheme: (v: Theme) => void;
  setAccent: (v: Accent) => void;
  setCustomAccent: (v: string) => void;
  setChartStyle: (v: ChartStyle) => void;
  setChartCurve: (v: ChartCurve) => void;
  setChartLabels: (v: ChartLabels) => void;
  setColorBlindFilter: (v: ColorBlindFilter) => void;
  setToolsMode: (v: ToolsMode) => void;
  setAgentsShowTtft: (v: boolean) => void;
  setShowExampleData: (v: boolean) => void;
  setShowRawModels: (v: boolean) => void;
  setTraceMatchCap: (v: TraceMatchCap) => void;
  setShowScanDebug: (v: boolean) => void;
  setBucketFilterEnabled: (v: boolean) => void;
  setBucketFilterText: (v: string) => void;
  resetTweaks: () => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const TweaksContext = createContext<TweaksContextValue | null>(null);

export const TweaksProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [tweaks, setTweaks] = usePersistedState<TweaksState>(
    "ai-obs.tweaks",
    DEFAULT_TWEAKS,
  );
  const [isPanelOpen, setPanelOpen] = useState(false);

  // Mirror every tweak onto the document root as a data-attribute so plain
  // CSS rules can react without React having to touch every component.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-aiobs-theme", tweaks.theme);
    root.setAttribute("data-aiobs-accent", tweaks.accent);
    // Custom accent: write --blue inline on root, which beats the
    // CSS data-aiobs-accent selectors (those are :root scoped too, but
    // the inline declaration has higher specificity by the cascade
    // tie-breaker rule).
    if (tweaks.accent === "custom") {
      root.style.setProperty("--blue", tweaks.customAccent);
    } else {
      root.style.removeProperty("--blue");
    }
    // Colorblind filter on the app body so SVG / canvas / IMG all get
    // remapped through the matrix.
    document.body.style.filter =
      tweaks.colorBlindFilter === "none"
        ? ""
        : `url(#aiobs-cb-${tweaks.colorBlindFilter})`;
    // Also poke Strato's own data-theme so its tokens follow our pick — the
    // platform normally writes this based on user prefs, but our toggle wins.
    root.setAttribute("data-theme", tweaks.theme);
  }, [tweaks]);

  // usePersistedState doesn't take a functional setter, so each per-key
  // helper reads the current tweaks object directly and writes the merged
  // object back. The memo keys on `tweaks` so handlers always carry the
  // latest snapshot.
  const value = useMemo<TweaksContextValue>(() => {
    const merge =
      <K extends keyof TweaksState>(key: K) =>
      (v: TweaksState[K]) =>
        setTweaks({ ...tweaks, [key]: v });
    // Old persisted snapshots predate pageConfig — backfill defaults so the
    // new controls always have a value to read/write.
    const pageConfig: PageConfig = {
      ...DEFAULT_TWEAKS.pageConfig,
      ...tweaks.pageConfig,
    };
    const mergePage =
      <K extends keyof PageConfig>(key: K) =>
      (v: PageConfig[K]) =>
        setTweaks({ ...tweaks, pageConfig: { ...pageConfig, [key]: v } });
    return {
      ...tweaks,
      pageConfig,
      setTheme: merge("theme"),
      setAccent: merge("accent"),
      setCustomAccent: merge("customAccent"),
      setChartStyle: merge("chartStyle"),
      setChartCurve: merge("chartCurve"),
      setChartLabels: merge("chartLabels"),
      setColorBlindFilter: merge("colorBlindFilter"),
      setToolsMode: mergePage("toolsMode"),
      setAgentsShowTtft: mergePage("agentsShowTtft"),
      setShowExampleData: mergePage("showExampleData"),
      setShowRawModels: mergePage("showRawModels"),
      setTraceMatchCap: mergePage("traceMatchCap"),
      setShowScanDebug: mergePage("showScanDebug"),
      setBucketFilterEnabled: mergePage("bucketFilterEnabled"),
      setBucketFilterText: mergePage("bucketFilterText"),
      resetTweaks: () => setTweaks(DEFAULT_TWEAKS),
      isPanelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      togglePanel: () => setPanelOpen((p) => !p),
    };
  }, [tweaks, isPanelOpen, setTweaks]);

  return (
    <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>
  );
};

export const useTweaks = (): TweaksContextValue => {
  const ctx = useContext(TweaksContext);
  if (!ctx) throw new Error("useTweaks must be used within a TweaksProvider");
  return ctx;
};

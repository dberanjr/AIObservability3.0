import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePersistedState } from "../state/usePersistedState";

export type Theme = "light" | "dark";
/** "minimal" strips chrome (shadows, borders, padding) for a data-first read. */
export type Density = "comfortable" | "compact" | "minimal";
export type TileStyle = "card" | "bordered" | "ghost";
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

export interface TweaksState {
  theme: Theme;
  density: Density;
  tileStyle: TileStyle;
  accent: Accent;
  /** Hex color stored for the "custom" accent — preserved across toggles. */
  customAccent: string;
  chartStyle: ChartStyle;
  chartCurve: ChartCurve;
  chartLabels: ChartLabels;
  colorBlindFilter: ColorBlindFilter;
}

export const DEFAULT_TWEAKS: TweaksState = {
  theme: "light",
  density: "comfortable",
  tileStyle: "card",
  accent: "blue",
  customAccent: "#1C5BE5",
  chartStyle: "area",
  chartCurve: "linear",
  chartLabels: "none",
  colorBlindFilter: "none",
};

export interface TweaksContextValue extends TweaksState {
  setTheme: (v: Theme) => void;
  setDensity: (v: Density) => void;
  setTileStyle: (v: TileStyle) => void;
  setAccent: (v: Accent) => void;
  setCustomAccent: (v: string) => void;
  setChartStyle: (v: ChartStyle) => void;
  setChartCurve: (v: ChartCurve) => void;
  setChartLabels: (v: ChartLabels) => void;
  setColorBlindFilter: (v: ColorBlindFilter) => void;
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
    root.setAttribute("data-aiobs-density", tweaks.density);
    root.setAttribute("data-aiobs-tile", tweaks.tileStyle);
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
    return {
      ...tweaks,
      setTheme: merge("theme"),
      setDensity: merge("density"),
      setTileStyle: merge("tileStyle"),
      setAccent: merge("accent"),
      setCustomAccent: merge("customAccent"),
      setChartStyle: merge("chartStyle"),
      setChartCurve: merge("chartCurve"),
      setChartLabels: merge("chartLabels"),
      setColorBlindFilter: merge("colorBlindFilter"),
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

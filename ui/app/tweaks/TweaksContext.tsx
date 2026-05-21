import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePersistedState } from "../state/usePersistedState";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
export type TileStyle = "card" | "bordered" | "ghost";
export type Accent = "blue" | "purple";
export type ChartStyle = "line" | "area" | "gradient";

export interface TweaksState {
  theme: Theme;
  density: Density;
  tileStyle: TileStyle;
  leftRail: boolean;
  accent: Accent;
  chartStyle: ChartStyle;
}

export const DEFAULT_TWEAKS: TweaksState = {
  theme: "light",
  density: "comfortable",
  tileStyle: "card",
  leftRail: true,
  accent: "blue",
  chartStyle: "area",
};

export interface TweaksContextValue extends TweaksState {
  setTheme: (v: Theme) => void;
  setDensity: (v: Density) => void;
  setTileStyle: (v: TileStyle) => void;
  setLeftRail: (v: boolean) => void;
  setAccent: (v: Accent) => void;
  setChartStyle: (v: ChartStyle) => void;
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
    root.setAttribute("data-aiobs-rail", tweaks.leftRail ? "on" : "off");
    // Also poke Strato's own data-theme so its tokens follow our pick — the
    // platform normally writes this based on user prefs, but our toggle wins.
    root.setAttribute("data-theme", tweaks.theme);
    return () => {
      // Don't strip on unmount — last tweak should survive a navigation.
    };
  }, [tweaks]);

  // usePersistedState doesn't take a functional setter, so each per-key
  // helper reads the current tweaks object directly and writes the merged
  // object back. The memo keys on `tweaks` so handlers always carry the
  // latest snapshot.
  const value = useMemo<TweaksContextValue>(() => {
    const merge = <K extends keyof TweaksState>(key: K) => (v: TweaksState[K]) =>
      setTweaks({ ...tweaks, [key]: v });
    return {
      ...tweaks,
      setTheme: merge("theme"),
      setDensity: merge("density"),
      setTileStyle: merge("tileStyle"),
      setLeftRail: merge("leftRail"),
      setAccent: merge("accent"),
      setChartStyle: merge("chartStyle"),
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

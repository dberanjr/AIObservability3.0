import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePersistedAppState } from "../state/usePersistedAppState";
import {
  setPricingOverrides,
  type ModelPricing,
} from "../data/pricing";

/**
 * Shape of the org-wide pricing config stored under one app-state key.
 * Keys are the canonical (normalized) model identifiers; values are the
 * full ModelPricing record. Anything not in this map falls through to the
 * built-in PRICING table baked into the app.
 */
export interface PricingConfig {
  /** Per-model overrides + user-added custom models. */
  overrides: Record<string, ModelPricing>;
}

export const EMPTY_PRICING_CONFIG: PricingConfig = { overrides: {} };

const STORAGE_KEY = "ai-obs.model-pricing-overrides";

export interface ModelPricingContextValue {
  config: PricingConfig;
  /** Write the entire merged config back to storage. */
  saveConfig: (next: PricingConfig) => void;
  /** Reset to the empty config (drops all overrides). */
  resetConfig: () => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const ModelPricingContext = createContext<ModelPricingContextValue | null>(
  null,
);

export const ModelPricingProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [config, setConfig] = usePersistedAppState<PricingConfig>(
    STORAGE_KEY,
    EMPTY_PRICING_CONFIG,
  );
  const [isPanelOpen, setPanelOpen] = useState(false);

  // Mirror the overrides into the module-level registry every time the
  // remote config (or the optimistic local) changes. That keeps the
  // non-React `getPricing()` call sites in sync.
  useEffect(() => {
    setPricingOverrides(config?.overrides ?? {});
  }, [config]);

  const saveConfig = useCallback(
    (next: PricingConfig) => {
      setConfig(next);
    },
    [setConfig],
  );

  const resetConfig = useCallback(() => {
    setConfig(EMPTY_PRICING_CONFIG);
  }, [setConfig]);

  const value = useMemo<ModelPricingContextValue>(
    () => ({
      config: config ?? EMPTY_PRICING_CONFIG,
      saveConfig,
      resetConfig,
      isPanelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      togglePanel: () => setPanelOpen((p) => !p),
    }),
    [config, saveConfig, resetConfig, isPanelOpen],
  );

  return (
    <ModelPricingContext.Provider value={value}>
      {children}
    </ModelPricingContext.Provider>
  );
};

export const useModelPricing = (): ModelPricingContextValue => {
  const ctx = useContext(ModelPricingContext);
  if (!ctx)
    throw new Error(
      "useModelPricing must be used within a ModelPricingProvider",
    );
  return ctx;
};

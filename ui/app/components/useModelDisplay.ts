/**
 * Model-name display formatter. Model versions are normalized everywhere by
 * default (redesign directive #4); the Tweaks "Model names" toggle opts into the
 * raw string. Use this anywhere a model name is shown so the toggle is honored
 * app-wide from one place.
 */
import { useTweaks } from "../tweaks/TweaksContext";
import { canonicalizeModel } from "../detection/attributes";

export const useModelDisplay = (): ((
  raw: string | null | undefined,
) => string) => {
  const { pageConfig } = useTweaks();
  return (raw) => {
    if (!raw) return "—";
    return pageConfig.showRawModels ? raw : canonicalizeModel(raw).label;
  };
};

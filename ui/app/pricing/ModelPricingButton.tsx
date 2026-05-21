import React from "react";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";
import { useModelPricing } from "./ModelPricingContext";

/**
 * Header action button that opens the Model Pricing config panel. Mounts
 * inside <AppHeader.ActionItems> so it sits between the TimeframeSelector
 * and the Tweaks button.
 */
export const ModelPricingButton = () => {
  const { isPanelOpen, togglePanel } = useModelPricing();
  return (
    <AppHeader.ActionButton
      prefixIcon={
        <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
          {/* tag-with-$ glyph */}
          <path
            d="M2.5 8.5V3.5h5l6 6-5 5-6-6z"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx={5.5} cy={6.5} r={1} fill="currentColor" />
          <text
            x={9}
            y={11.5}
            fontSize={6.5}
            fontWeight="700"
            textAnchor="middle"
            fill="currentColor"
          >
            $
          </text>
        </svg>
      }
      isSelected={isPanelOpen}
      onClick={togglePanel}
      aria-label="Model pricing"
      aria-pressed={isPanelOpen}
    >
      Pricing
    </AppHeader.ActionButton>
  );
};

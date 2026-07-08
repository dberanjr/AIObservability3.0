import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Skeleton } from "@dynatrace/strato-components/content";

/**
 * The shared loading-placeholder convention (Cross-cutting empty-5).
 *
 * Loading is currently expressed three inconsistent ways across the app:
 * content-sized Skeletons, em-dash placeholders, and — worst — mounted bodies
 * that `return null` while loading (e.g. RagHalf in AgentContextStoresSubview,
 * SessionUserCostPanel), which collapses the card to zero height and then pops
 * content in, causing layout-shift jank.
 *
 * The convention the adoption stages should follow: a mounted panel body never
 * returns null while loading — it renders a <PanelSkeleton> sized to its final
 * content so the panel holds its footprint. Reserve `return null` strictly for
 * the not-yet-mounted / capability-probe phase handled by <CapabilityGate>.
 *
 * Thin wrapper over Strato's <Skeleton> so every panel gets the same rounded,
 * content-sized treatment from a single import.
 */
export interface PanelSkeletonProps {
  /** Total height in px — match the final content to avoid layout shift. */
  height?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Render N stacked bars (a list/table) instead of one block. */
  lines?: number;
  style?: React.CSSProperties;
}

export const PanelSkeleton = ({
  height = 120,
  radius = 8,
  lines,
  style,
}: PanelSkeletonProps) => {
  if (lines && lines > 1) {
    // Stacked bars share the height evenly (account for the inter-row gap).
    const gap = 8;
    const rowHeight = Math.max(
      12,
      Math.round((height - gap * (lines - 1)) / lines),
    );
    return (
      <Flex flexDirection="column" gap={gap} style={style}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} style={{ height: rowHeight, borderRadius: radius }} />
        ))}
      </Flex>
    );
  }
  return <Skeleton style={{ height, borderRadius: radius, ...style }} />;
};

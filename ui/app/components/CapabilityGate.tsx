/**
 * Renders its children only when at least one of the named attribute
 * capabilities has coverage in the current scope. While the capability probe
 * is loading, nothing is rendered (avoids a flash of an empty panel). Because
 * the children only mount once a capability is present, their own DQL queries
 * never run on tenants that don't emit the attribute — so a gated panel is
 * free until the data exists, then lights up automatically.
 */

import React from "react";
import { useCapability } from "../scope/CapabilityContext";
import type { CapabilityId } from "../detection/attributeFields";

export interface CapabilityGateProps {
  /** Render children when ANY of these capabilities is present. */
  id: CapabilityId | CapabilityId[];
  children: React.ReactNode;
  /**
   * Rendered when none of the capabilities are present in the current scope
   * (default: nothing). Pass a short "not instrumented here" note so a gated
   * panel explains its absence instead of silently vanishing to null — the
   * caller decides whether a given panel is worth a placeholder. Still nothing
   * while the probe is loading, to avoid a flash.
   */
  fallback?: React.ReactNode;
}

export const CapabilityGate = ({
  id,
  children,
  fallback = null,
}: CapabilityGateProps) => {
  const cap = useCapability();
  if (cap.isLoading) return null;
  const ids = Array.isArray(id) ? id : [id];
  if (!ids.some((i) => cap.has(i))) return <>{fallback}</>;
  return <>{children}</>;
};

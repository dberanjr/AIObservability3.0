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
}

export const CapabilityGate = ({ id, children }: CapabilityGateProps) => {
  const cap = useCapability();
  if (cap.isLoading) return null;
  const ids = Array.isArray(id) ? id : [id];
  if (!ids.some((i) => cap.has(i))) return null;
  return <>{children}</>;
};

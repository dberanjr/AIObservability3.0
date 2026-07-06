/**
 * Renders its children only when at least one of the named attribute
 * capabilities has coverage in the current scope. While the capability probe
 * is loading, nothing is rendered (avoids a flash of an empty panel). Because
 * the children only mount once a capability is present, their own DQL queries
 * never run on tenants that don't emit the attribute — so a gated panel is
 * free until the data exists, then lights up automatically.
 *
 * When the capability is absent (probe finished, coverage is zero) the gate
 * renders, in order of precedence:
 *   1. an explicit `fallback` prop if provided (including an explicit `null`);
 *   2. otherwise, if a `label` is given, a small 'available with
 *      instrumentation' EmptyState so the feature explains its absence instead
 *      of silently vanishing to null (Cross-cutting empty-1);
 *   3. otherwise nothing (the original default).
 * It still renders nothing while the probe is loading, regardless of label.
 */

import React from "react";
import { useCapability } from "../scope/CapabilityContext";
import type { CapabilityId } from "../detection/attributeFields";
import { EmptyState } from "./EmptyState";

export interface CapabilityGateProps {
  /** Render children when ANY of these capabilities is present. */
  id: CapabilityId | CapabilityId[];
  children: React.ReactNode;
  /**
   * Rendered when none of the capabilities are present in the current scope.
   * Overrides the `label` default fallback below. Pass explicit `null` to force
   * "render nothing when absent". Still nothing while the probe is loading.
   */
  fallback?: React.ReactNode;
  /**
   * When absent and no explicit `fallback` is given, render a small
   * 'no-instrumentation' EmptyState with this headline instead of vanishing to
   * null. Reserve null strictly for the loading phase.
   */
  label?: string;
  /** Optional hint under the default fallback — name the gating attribute(s). */
  hint?: React.ReactNode;
}

export const CapabilityGate = ({
  id,
  children,
  fallback,
  label,
  hint,
}: CapabilityGateProps) => {
  const cap = useCapability();
  if (cap.isLoading) return null;
  const ids = Array.isArray(id) ? id : [id];
  if (ids.some((i) => cap.has(i))) return <>{children}</>;
  // Absent (not loading). Explicit fallback (incl. null) wins over the default.
  if (fallback !== undefined) return <>{fallback}</>;
  if (label) {
    return <EmptyState bare cause="no-instrumentation" title={label} hint={hint} />;
  }
  return null;
};

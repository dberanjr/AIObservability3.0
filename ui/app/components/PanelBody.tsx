import React from "react";
import { PanelSkeleton } from "./PanelSkeleton";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";

export interface PanelBodyProps {
  /** True while the panel's data is loading — renders the skeleton. */
  isLoading?: boolean;
  /** A thrown/hook error — renders a bare ErrorState (with Retry if onRetry). */
  error?: Error | null;
  /** True when the query succeeded but there is nothing to show. */
  isEmpty?: boolean;
  /** The node to render for the empty state — pair with <EmptyState cause=…>.
   *  Defaults to a bare neutral EmptyState when omitted. */
  emptyState?: React.ReactNode;
  /** Override the default loading skeleton (e.g. a content-sized PanelSkeleton
   *  with a matching height / line count). */
  skeleton?: React.ReactNode;
  /** Bound retry handler passed to the ErrorState (typically `refetch`). */
  onRetry?: () => void;
  children?: React.ReactNode;
}

/**
 * Resolves the four canonical panel states in one place so every panel body
 * handles loading / error / empty / content the same way (Cross-cutting
 * STATE-5). Order: loading → error → empty → content. A mounted body should
 * never `return null` while loading — it renders <PanelSkeleton> so the panel
 * holds its footprint (see PanelSkeleton's note); reserve `return null` for the
 * not-yet-mounted capability-probe phase handled by <CapabilityGate>.
 */
export const PanelBody = ({
  isLoading,
  error,
  isEmpty,
  emptyState,
  skeleton,
  onRetry,
  children,
}: PanelBodyProps) => {
  if (isLoading) return <>{skeleton ?? <PanelSkeleton />}</>;
  if (error) return <ErrorState bare error={error} onRetry={onRetry} />;
  if (isEmpty) return <>{emptyState ?? <EmptyState bare />}</>;
  return <>{children}</>;
};

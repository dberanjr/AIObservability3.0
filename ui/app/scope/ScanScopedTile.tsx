import React from "react";
import { ScanScope } from "./ScanReportContext";
import { TileScanFooter } from "./TileScanFooter";

/**
 * Wrap a tile so it (a) tags every DQL scan in its subtree with a group id and
 * (b) renders the per-tile scan pill + inherited-note (both Tweaks-gated, off by
 * default). Use a page-unique `name` that reads well — it is BOTH the scope id
 * and the label shown in another tile's "inherits from …" note (e.g.
 * "Cost per call"). Names only need to be unique within a page, since only one
 * page's tiles are mounted at a time.
 *
 * Wrap the tile ELEMENT (not its inner chrome) so the tile's own data hooks —
 * which run during its render — read this scope.
 */
export const ScanScopedTile = ({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) => (
  <ScanScope name={name}>
    {children}
    <TileScanFooter group={name} />
  </ScanScope>
);

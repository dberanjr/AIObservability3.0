import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { fmtScanBytes, fmtSecs1 } from "../data/format";
import { NEON, neonPill } from "../components/ScanDebug";
import { useScanEntries } from "./ScanReportContext";
import { useTweaks } from "../tweaks/TweaksContext";
import { computeTileReport, type TileScanOpts } from "./tileScan";

const MICRO = 9.5;

/**
 * Per-tile scan diagnostics, for ANY page. Shows (Tweaks-gated) a neon pill
 * with the tile's OWN scan cost, and — in the same neon color — a note when the
 * tile also renders data inherited from another tile's DQL query (react-query
 * serves the shared query from cache, so this tile scanned nothing extra for
 * it). The scan-limit warning shows regardless of the toggle, since it flags
 * possibly-truncated numbers. `opts` lets a page supply curated titles /
 * ownership priority; omitted, ownership is deterministic and the inherited
 * note names the raw ScanScope group.
 */
export const TileScanFooter = ({
  group,
  opts,
}: {
  group: string | null;
  opts?: TileScanOpts;
}) => {
  const { showScanDebug } = useTweaks().pageConfig;
  const entries = useScanEntries();
  const report = useMemo(
    () => computeTileReport(entries, group, opts),
    [entries, group, opts],
  );

  const showBadge = showScanDebug && report.owned != null;
  const showInherit = showScanDebug && report.inheritedFrom.length > 0;
  if (!report.limitHit && !showBadge && !showInherit) return null;

  const q = report.owned?.queryCount ?? 0;
  return (
    <Flex
      flexDirection="column"
      alignItems="flex-start"
      gap={2}
      style={{ marginTop: 8, paddingTop: 6, borderTop: "1px dashed var(--border)" }}
    >
      {report.limitHit && (
        <Text
          style={{
            fontSize: MICRO,
            lineHeight: 1.3,
            color: "var(--amber, var(--text-3))",
            fontStyle: "italic",
          }}
        >
          Scan limit reached — values may be partial.
        </Text>
      )}
      {showBadge && report.owned && (
        <span
          style={neonPill(MICRO)}
          title={`${q} DQL quer${q === 1 ? "y" : "ies"} · ${fmtScanBytes(report.owned.scannedBytes)} scanned · ${fmtSecs1(report.owned.executionMs)}`}
        >
          {q} quer{q === 1 ? "y" : "ies"} · {fmtScanBytes(report.owned.scannedBytes)} ·{" "}
          {fmtSecs1(report.owned.executionMs)}
        </span>
      )}
      {showInherit && (
        <Text
          style={{
            fontSize: MICRO,
            lineHeight: 1.3,
            color: NEON,
            fontFamily: "var(--mono, monospace)",
          }}
          title={`This tile reuses DQL results already fetched by: ${report.inheritedFrom.join(", ")}`}
        >
          ↳ {report.owned ? "also inherits" : "inherits DQL results"} from{" "}
          {report.inheritedFrom.join(", ")}
        </Text>
      )}
    </Flex>
  );
};

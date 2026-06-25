import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtPercent, fmtUSDCompact } from "../../data/format";
import type { ServiceCost } from "./useFinOps";
import { ServiceDetailModal } from "./ServiceDetailModal";

const COLORS = [
  "var(--blue)",
  "var(--purple)",
  "var(--cyan)",
  "var(--purple-2)",
  "var(--green-2)",
  "var(--amber)",
  "var(--blue-purple)",
];

interface Tile {
  service: ServiceCost;
  color: string;
  /** All four sides as percentages of the container. */
  left: number;
  top: number;
  width: number;
  height: number;
  area: number;
}

const buildTiles = (services: ServiceCost[]): Tile[] => {
  const priced = services.filter((s) => s.cost > 0);
  if (priced.length === 0) return [];
  const total = priced.reduce((acc, s) => acc + s.cost, 0);
  if (total === 0) return [];

  // Top item: left half. Remainder: vertical stack on the right with heights
  // proportional to remaining cost. This is the spec's slice-and-dice layout.
  const head = priced[0];
  const tail = priced.slice(1);
  const headShare = head.cost / total;
  const tiles: Tile[] = [
    {
      service: head,
      color: COLORS[0],
      left: 0,
      top: 0,
      width: 50,
      height: 100,
      area: headShare * 100,
    },
  ];

  const tailTotal = tail.reduce((acc, s) => acc + s.cost, 0);
  if (tail.length === 0 || tailTotal === 0) {
    tiles[0].width = 100;
    return tiles;
  }

  let runningTop = 0;
  tail.forEach((s, i) => {
    const share = s.cost / tailTotal;
    const height = share * 100;
    tiles.push({
      service: s,
      color: COLORS[(i + 1) % COLORS.length],
      left: 50,
      top: runningTop,
      width: 50,
      height,
      area: (s.cost / total) * 100,
    });
    runningTop += height;
  });
  return tiles;
};

const Cell = ({
  tile,
  onSelect,
}: {
  tile: Tile;
  onSelect: (service: ServiceCost) => void;
}) => {
  const small = tile.height < 12 || tile.width < 14;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${tile.service.service}`}
      onClick={() => onSelect(tile.service)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(tile.service);
        }
      }}
      title={`${tile.service.service}: ${fmtUSDCompact(tile.service.cost)} (${fmtPercent(tile.area, 0)}) — click for detail`}
      style={{
        position: "absolute",
        left: `${tile.left}%`,
        top: `${tile.top}%`,
        width: `${tile.width}%`,
        height: `${tile.height}%`,
        background: `color-mix(in oklab, ${tile.color} 18%, var(--surface))`,
        border: "1px solid var(--surface)",
        overflow: "hidden",
        padding: 8,
        boxSizing: "border-box",
        cursor: "pointer",
      }}
    >
      {!small && (
        <Flex flexDirection="column" gap={2}>
          <Text
            style={{
              fontFamily: "var(--mono, monospace)",
              fontSize: 11,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tile.service.service}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: tile.color,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtUSDCompact(tile.service.cost)} · {fmtPercent(tile.area, 0)}
          </Text>
        </Flex>
      )}
    </div>
  );
};

export interface CostConcentrationTreemapProps {
  services: ServiceCost[];
  isLoading: boolean;
}

export const CostConcentrationTreemap = ({
  services,
  isLoading,
}: CostConcentrationTreemapProps) => {
  const tiles = useMemo(() => buildTiles(services), [services]);
  const [selected, setSelected] = useState<ServiceCost | null>(null);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Cost concentration
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Slice-and-dice treemap by service spend (current scope) · click a
            tile for detail
          </Text>
        </Flex>
        {isLoading && tiles.length === 0 ? (
          <Skeleton style={{ height: 240, borderRadius: 8 }} />
        ) : tiles.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No priced spend in the current scope.
          </Text>
        ) : (
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 240,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            {tiles.map((t) => (
              <Cell key={t.service.service} tile={t} onSelect={setSelected} />
            ))}
          </div>
        )}
      </Flex>
      {selected && (
        <ServiceDetailModal
          service={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Surface>
  );
};

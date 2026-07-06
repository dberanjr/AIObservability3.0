import React, { createContext, useContext, useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { usePersistedState } from "../../state/usePersistedState";

type CollapsedMap = Record<string, boolean>;

interface SummaryLayoutValue {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
}

const SummaryLayoutContext = createContext<SummaryLayoutValue | null>(null);

/**
 * Owns the (per-user, persisted) collapsed state of the Summary tiles. Kept as
 * a single map so one write updates one tile without disturbing the others.
 */
export const SummaryLayoutProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [collapsed, setCollapsed] = usePersistedState<CollapsedMap>(
    "ai-obs.summary.collapsed",
    {},
  );
  const value = useMemo<SummaryLayoutValue>(
    () => ({
      isCollapsed: (id) => Boolean(collapsed[id]),
      toggle: (id) => setCollapsed({ ...collapsed, [id]: !collapsed[id] }),
    }),
    [collapsed, setCollapsed],
  );
  return (
    <SummaryLayoutContext.Provider value={value}>
      {children}
    </SummaryLayoutContext.Provider>
  );
};

const useSummaryLayout = () => useContext(SummaryLayoutContext);

// Lets the expanded card render its own collapse control inside its header
// (SummaryCard reads this) without SummaryPage having to thread callbacks.
interface TileCollapseValue {
  toggle: () => void;
  title: string;
}
const TileCollapseContext = createContext<TileCollapseValue | null>(null);
export const useTileCollapse = () => useContext(TileCollapseContext);

/** A chevron that points down when the tile is open, right when collapsed. */
const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden
    style={{
      transform: open ? "rotate(0deg)" : "rotate(-90deg)",
      transition: "transform 120ms ease",
    }}
  >
    <path
      d="M3.5 5.5L7 9l3.5-3.5"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Small icon button used for both collapse and expand affordances. */
export const CollapseButton = ({
  open,
  label,
  onClick,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    aria-expanded={open}
    title={label}
    onClick={onClick}
    style={{
      all: "unset",
      cursor: "pointer",
      padding: 3,
      borderRadius: 4,
      color: "var(--text-3)",
      lineHeight: 0,
      flex: "0 0 auto",
    }}
  >
    <Chevron open={open} />
  </button>
);

/**
 * Wraps a Summary tile so the user can tuck it away. Collapsing UNMOUNTS the
 * child card, so the hooks that fire its DQL queries stop running entirely —
 * a collapsed tile costs nothing to scan. Re-expanding remounts the card, which
 * re-runs those queries: that's the per-tile force-refresh, no full-dashboard
 * reload required.
 *
 * When collapsed we render a slim header-only bar (the child is gone, so its
 * own header is too); when open we hand the child a toggle via context so the
 * collapse control lives in the card's real header next to its drill link.
 */
export const CollapsibleTile = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) => {
  const layout = useSummaryLayout();

  const collapseValue = useMemo<TileCollapseValue | null>(
    () => (layout ? { toggle: () => layout.toggle(id), title } : null),
    [layout, id, title],
  );

  // No provider (e.g. reused outside the Summary page) → render as-is.
  if (!layout) return <>{children}</>;

  if (!layout.isCollapsed(id)) {
    return (
      <TileCollapseContext.Provider value={collapseValue}>
        {children}
      </TileCollapseContext.Provider>
    );
  }

  return (
    <Surface
      elevation="raised"
      padding={16}
      // align-self:start keeps the collapsed bar short even when its taller
      // siblings stretch the grid row — so it truly tucks out of the way.
      style={{ minWidth: 0, alignSelf: "start" }}
    >
      <Flex alignItems="center" justifyContent="space-between" gap={8} style={{ minHeight: 20 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </Text>
        <CollapseButton
          open={false}
          label={`Expand ${title} — reruns its queries`}
          onClick={() => layout.toggle(id)}
        />
      </Flex>
    </Surface>
  );
};

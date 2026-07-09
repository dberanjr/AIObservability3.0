import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useModalA11y } from "../useModalA11y";

/**
 * "Maximize" icon button. Used as the trigger for ChartModal.
 */
export const ExpandButton = ({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    title={ariaLabel}
    onClick={onClick}
    style={{
      all: "unset",
      cursor: "pointer",
      padding: 4,
      borderRadius: 4,
      color: "var(--text-3)",
      lineHeight: 0,
    }}
  >
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);

export interface ChartStat {
  label: string;
  value: string;
  /** Optional sublabel under the value, e.g., "across 24 hours". */
  sub?: string;
}

export interface ChartModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** The chart, re-rendered at the modal's larger size. */
  children: React.ReactNode;
  /** Summary stats shown below the chart. */
  stats?: ChartStat[];
}

/**
 * Full-screen overlay that shows a single chart at much larger size plus
 * a row of summary stats. Click backdrop or press Esc to dismiss.
 */
export const ChartModal = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  stats,
}: ChartModalProps) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);

  // Focus management (move focus in, trap Tab, Esc-to-close, restore on close).
  useModalA11y(dialogRef, onClose, { initialFocusRef: closeBtnRef, active: open });

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 10, 11, 0.55)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 1400,
          maxHeight: "calc(100vh - 64px)",
          background: "var(--surface)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflow: "auto",
        }}
      >
        <Flex alignItems="flex-start" justifyContent="space-between" gap={16}>
          <Flex flexDirection="column" gap={2}>
            <Heading level={2} style={{ fontSize: 18, fontWeight: 700 }}>
              {title}
            </Heading>
            {subtitle && (
              <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                {subtitle}
              </Text>
            )}
          </Flex>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close"
            className="aiobs-icon-btn"
            onClick={onClose}
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 18,
              lineHeight: 1,
              color: "var(--text-3)",
            }}
          >
            ×
          </button>
        </Flex>

        {/* flexShrink:0 (not flexGrow:1): in a scrolling flex column, letting
            this box shrink would compress it below its content height while the
            content (overflow visible) bled over the stats footer below. Pinning
            it makes tall content grow the box and scroll the modal instead. */}
        <div style={{ minHeight: 360, flexShrink: 0 }}>{children}</div>

        {stats && stats.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(stats.length, 6)}, minmax(0, 1fr))`,
              gap: 12,
              borderTop: "1px solid var(--border)",
              paddingTop: 16,
              flexShrink: 0,
            }}
          >
            {stats.map((s) => (
              <Flex key={s.label} flexDirection="column" gap={2}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                  }}
                >
                  {s.label}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text)",
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </Text>
                {s.sub && (
                  <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {s.sub}
                  </Text>
                )}
              </Flex>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Small wrapper: returns a function-call API to a parent component so it
 * can drop in [`ExpandButton`, `<ChartModal>`] without managing state.
 */
export const useChartExpander = () => {
  const [open, setOpen] = useState(false);
  return {
    open,
    setOpen,
    expandButton: (ariaLabel: string) => (
      <ExpandButton ariaLabel={ariaLabel} onClick={() => setOpen(true)} />
    ),
  };
};

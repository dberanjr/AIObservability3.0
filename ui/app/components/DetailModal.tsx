import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";

/**
 * Shared presentational primitives for the centered detail modals (model row,
 * service tile, …). The Explorer service×model modal predates this and keeps its
 * own copies; new modals should use these so the cost / pricing / golden-signal
 * cards stay visually identical across the app. Backdrop click + Esc dismiss.
 */

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

export const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div
    style={{
      borderTop: "1px solid var(--border)",
      paddingTop: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}
  >
    <Text style={LABEL_STYLE}>{title}</Text>
    {children}
  </div>
);

export const Stat = ({
  label,
  value,
  sub,
  emphasize,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
  danger?: boolean;
}) => (
  <Flex flexDirection="column" gap={2}>
    <Text style={LABEL_STYLE}>{label}</Text>
    <Text
      style={{
        fontSize: emphasize ? 20 : 15,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1,
        color: danger ? "var(--red)" : "var(--text)",
      }}
    >
      {value}
    </Text>
    {sub && <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>}
  </Flex>
);

export const StatGrid = ({
  cols,
  children,
}: {
  cols: number;
  children: React.ReactNode;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: 16,
    }}
  >
    {children}
  </div>
);

export const EstimatedBadge = () => (
  <span
    title="The cost shown is an estimate — priced at a blended/fallback rate. Add the model to the Model Pricing table for an exact figure."
    style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "var(--amber)",
      border: "1px solid var(--amber)",
      borderRadius: 4,
      padding: "1px 6px",
      whiteSpace: "nowrap",
    }}
  >
    ≈ estimated rate
  </span>
);

export interface DetailModalShellProps {
  title: string;
  subtitle?: string;
  /** Render the title in monospace (model names, service ids). */
  monoTitle?: boolean;
  onClose: () => void;
  /** Optional footer row (e.g. a "Filter to this" action). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Centered modal scaffold: fixed backdrop, escape-to-close, scrollable card,
 * header with close button, and an optional footer. Content is supplied by the
 * caller (usually a stack of <Section>s).
 */
export const DetailModalShell = ({
  title,
  subtitle,
  monoTitle,
  onClose,
  footer,
  children,
}: DetailModalShellProps) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
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
          <Flex flexDirection="column" gap={4}>
            <Heading
              level={2}
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: monoTitle ? "var(--mono, monospace)" : undefined,
              }}
            >
              {title}
            </Heading>
            {subtitle && (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                {subtitle}
              </Text>
            )}
          </Flex>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
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

        {children}

        {footer && (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 16,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

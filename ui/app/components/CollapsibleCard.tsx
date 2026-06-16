import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { InfoTooltip } from "./InfoTooltip";

export interface CollapsibleCardProps {
  title: string;
  /** Optional info-icon tooltip text shown next to the title. */
  info?: string;
  /** Subtitle rendered under the title (inside the clickable header). */
  subtitle?: React.ReactNode;
  /**
   * Right-aligned header content (badges, counts, segmented controls, …).
   * Clicks here don't toggle the section.
   */
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state. When provided, the card is controlled. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** Padding for the body wrapper. Default 0 (children manage their own). */
  bodyPadding?: number | string;
  bodyStyle?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * Raised-Surface card with a clickable header that collapses its body — the
 * same pattern as the Orchestration & Upstream sections, generalised so every
 * Agents-page section can collapse. Header carries a chevron, title, optional
 * info tooltip + subtitle, and a right-side actions slot.
 */
export const CollapsibleCard = ({
  title,
  info,
  subtitle,
  headerRight,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  bodyPadding = 0,
  bodyStyle,
  children,
}: CollapsibleCardProps) => {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const toggle = () => {
    const next = !open;
    if (onOpenChange) onOpenChange(next);
    if (openProp === undefined) setOpenState(next);
  };

  return (
    <Surface elevation="raised" padding={0}>
      <Flex alignItems="center" gap={8} style={{ padding: "12px 16px" }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          {open ? (
            <ChevronDownIcon size={16} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
          ) : (
            <ChevronRightIcon size={16} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
          )}
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
            <Flex alignItems="center" gap={6}>
              <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
                {title}
              </Heading>
              {info && <InfoTooltip text={info} />}
            </Flex>
            {subtitle &&
              (typeof subtitle === "string" ? (
                <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  {subtitle}
                </Text>
              ) : (
                subtitle
              ))}
          </Flex>
        </button>
        {headerRight && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12 }}
          >
            {headerRight}
          </div>
        )}
      </Flex>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: bodyPadding, ...bodyStyle }}>
          {children}
        </div>
      )}
    </Surface>
  );
};

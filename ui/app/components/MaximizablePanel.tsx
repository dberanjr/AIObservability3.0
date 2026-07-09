import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { ChartModal, ExpandButton, useChartExpander, type ChartStat } from "./charts/ChartExpander";

export interface MaximizablePanelProps {
  /** Section title (also the modal title). */
  title: string;
  /** One-line description under the title. */
  subtitle?: string;
  /** Small uppercase eyebrow above the title. */
  eyebrow?: string;
  /** The normal in-page content. */
  children: React.ReactNode;
  /** Richer content for the full-screen focused view. Falls back to `children`.
   *  Use to add the underlying data table / extra breakdowns alongside a chart. */
  expanded?: React.ReactNode;
  /** Summary stats shown under the content in the focused view. */
  stats?: ChartStat[];
  /** Extra header controls (e.g. a show/hide toggle) shown left of the maximize
   *  button. */
  headerRight?: React.ReactNode;
}

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

/**
 * A raised Surface section with a "maximize" affordance in its header. Clicking
 * it opens a full-screen, distraction-free ChartModal that re-renders the
 * section's content at large size (using `expanded` when provided, so a chart
 * can appear alongside its full data table), plus an optional summary-stats row.
 *
 * Sections adopt this as their ROOT (in place of their own Surface + header) so
 * the maximize button, title, and framing stay identical across every chart and
 * data section on the AWS Bedrock page.
 */
export const MaximizablePanel = ({
  title,
  subtitle,
  eyebrow,
  children,
  expanded,
  stats,
  headerRight,
}: MaximizablePanelProps) => {
  const { open, setOpen } = useChartExpander();
  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex justifyContent="space-between" alignItems="flex-start" gap={12}>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
            {eyebrow && <Text style={EYEBROW}>{eyebrow}</Text>}
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              {title}
            </Heading>
            {subtitle && (
              <Text style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4 }}>
                {subtitle}
              </Text>
            )}
          </Flex>
          <Flex alignItems="center" gap={8} style={{ flex: "0 0 auto" }}>
            {headerRight}
            <ExpandButton ariaLabel={`Maximize ${title}`} onClick={() => setOpen(true)} />
          </Flex>
        </Flex>
        {children}
      </Flex>

      <ChartModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={subtitle}
        stats={stats}
      >
        {expanded ?? children}
      </ChartModal>
    </Surface>
  );
};

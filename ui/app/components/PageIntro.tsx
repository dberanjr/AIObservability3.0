import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useTabNav } from "../lib/nav";

/**
 * The one-line "you are here" anchor at the top of an overview page, plus an
 * explicit cross-link to its sibling overview so the two front doors state their
 * relationship instead of competing (IA — Information-3).
 *
 * Summary is the executive, at-rest scorecard; Pulse is the live-operations
 * surface. Each page names its own job in `subtitle` and points at the other
 * with `crossLead` + a `crossLabel` pill. The pill routes through `useTabNav`,
 * so the active timeframe, segments, scan-limit, and trace filter carry over
 * exactly like a top-nav tab click.
 */
export interface PageIntroProps {
  title: string;
  /** One-line purpose stating THIS page's job in the division of labor. */
  subtitle: React.ReactNode;
  /** Destination route for the cross-link (e.g. "/pulse"). */
  crossTo: string;
  /** Sentence stating the relationship, read as a lead-in to the pill. */
  crossLead: string;
  /** Pill label, including the arrow (e.g. "Pulse →"). */
  crossLabel: string;
  /** Native title/tooltip on the pill. */
  crossTitle?: string;
}

export const PageIntro = ({
  title,
  subtitle,
  crossTo,
  crossLead,
  crossLabel,
  crossTitle,
}: PageIntroProps) => {
  const goToTab = useTabNav();
  return (
    <Flex flexDirection="column" gap={6}>
      <Flex flexDirection="column" gap={2}>
        <Heading level={1} style={{ fontSize: 18, fontWeight: 700 }}>
          {title}
        </Heading>
        <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
          {subtitle}
        </Text>
      </Flex>
      <Flex
        alignItems="center"
        gap={8}
        style={{ flexWrap: "wrap", rowGap: 4 }}
      >
        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>{crossLead}</Text>
        <button
          type="button"
          className="aiobs-crosslink"
          title={crossTitle}
          onClick={() => goToTab(crossTo)}
        >
          {crossLabel}
        </button>
      </Flex>
    </Flex>
  );
};

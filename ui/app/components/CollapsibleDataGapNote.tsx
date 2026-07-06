import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  WarningIcon,
  InformationIcon,
} from "@dynatrace/strato-icons";
import { DataGapNote, type DataGapNoteProps } from "./DataGapNote";

/**
 * Collapses a standing page-top DataGapNote into a one-line, expandable
 * affordance so an instrumentation caveat stops outranking the data it
 * qualifies (IA — Information-8). Collapsed by default: the full DataGapNote
 * (banner variant) is one click away instead of a persistent block above the
 * KPIs. Generalises the pattern the Agents tab introduced with AgentsCaveatNote
 * so every page can reuse the same calm treatment.
 */
export interface CollapsibleDataGapNoteProps extends DataGapNoteProps {
  /** One-line summary shown while collapsed (e.g. "Data caveats: …"). */
  summary: string;
  /** Start expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
}

export const CollapsibleDataGapNote = ({
  summary,
  defaultOpen = false,
  tone = "info",
  variant = "banner",
  ...rest
}: CollapsibleDataGapNoteProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const color = tone === "warn" ? "var(--amber)" : "var(--text-3)";
  const Icon = tone === "warn" ? WarningIcon : InformationIcon;
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <Flex flexDirection="column" gap={6}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
        }}
      >
        <Icon size={12} style={{ color, flex: "0 0 auto" }} />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{summary}</Text>
        <Chevron size={14} style={{ color: "var(--text-3)" }} />
      </button>
      {open && <DataGapNote tone={tone} variant={variant} {...rest} />}
    </Flex>
  );
};

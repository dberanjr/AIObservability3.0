/**
 * Subtle, unobtrusive indicators for missing / estimated data (redesign
 * directives: indicate missing attributes wherever possible, and flag blended
 * cost estimates). Small font, muted colour — informative, never alarming.
 */
import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";

/** Inline "this is missing because attribute X isn't emitted" hint. */
export const MissingDataHint = ({
  note,
  attribute,
}: {
  note: string;
  attribute?: string;
}) => (
  <Text
    style={{ fontSize: 10.5, color: "var(--text-4)", fontStyle: "italic" }}
  >
    {note}
    {attribute ? (
      <>
        {" · "}
        <code style={{ fontStyle: "normal" }}>{attribute}</code>
      </>
    ) : null}
  </Text>
);

/**
 * "≈" marker shown next to a cost that was priced at the BLENDED fallback rate
 * (model missing from the pricing table). Hover explains and prompts the fix.
 */
export const BlendedBadge = () => (
  <span
    title="Estimated at a blended rate — this model isn't in the pricing table. Add it (Model pricing panel) for an accurate figure."
    style={{ marginLeft: 3, fontSize: 11, color: "var(--text-4)", cursor: "help" }}
  >
    ≈
  </span>
);

/**
 * Frame around a panel rendered with EXAMPLE data (showExampleData on, real
 * attribute absent). Clearly labelled so example data is never mistaken for
 * real telemetry.
 */
export const ExampleDataFrame = ({
  children,
  attribute,
}: {
  children: React.ReactNode;
  attribute?: string;
}) => (
  <div
    style={{
      border: "1px dashed var(--amber)",
      borderRadius: 6,
      padding: 10,
      position: "relative",
    }}
  >
    <Flex
      alignItems="center"
      gap={6}
      style={{ marginBottom: 6 }}
    >
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--amber)",
          border: "1px solid var(--amber)",
          borderRadius: 4,
          padding: "0 5px",
        }}
      >
        Example data
      </span>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>
        Not from your telemetry — shown so you can see what{" "}
        {attribute ? <code>{attribute}</code> : "this attribute"} would enable.
      </Text>
    </Flex>
    <div style={{ opacity: 0.85 }}>{children}</div>
  </div>
);

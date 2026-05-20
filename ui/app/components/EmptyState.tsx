import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  /** Optional decorative icon node. Render with size 28. */
  icon?: React.ReactNode;
  /** Footnote-style hint shown below the description in smaller text. */
  hint?: React.ReactNode;
  actions?: EmptyStateAction[];
  /** Render bare (no Surface frame) when nesting inside an already-framed panel. */
  bare?: boolean;
  /** Stretch to fill the parent's height. */
  fill?: boolean;
}

const Inner = ({
  title,
  description,
  icon,
  hint,
  actions,
}: Pick<EmptyStateProps, "title" | "description" | "icon" | "hint" | "actions">) => (
  <Flex
    flexDirection="column"
    alignItems="center"
    gap={8}
    style={{ textAlign: "center", maxWidth: 480 }}
  >
    {icon && (
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--surface-3)",
          color: "var(--text-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
    )}
    <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
      {title}
    </Heading>
    {description && (
      <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
        {description}
      </Text>
    )}
    {hint && (
      <Text style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
        {hint}
      </Text>
    )}
    {actions && actions.length > 0 && (
      <Flex gap={6} style={{ marginTop: 4 }}>
        {actions.map((a) =>
          a.href ? (
            <Button
              key={a.label}
              as="a"
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              variant="default"
            >
              {a.label}
            </Button>
          ) : (
            <Button
              key={a.label}
              variant="default"
              onClick={a.onClick}
              disabled={!a.onClick}
            >
              {a.label}
            </Button>
          ),
        )}
      </Flex>
    )}
  </Flex>
);

export const EmptyState = ({
  title,
  description,
  icon,
  hint,
  actions,
  bare,
  fill,
}: EmptyStateProps) => {
  const body = (
    <Flex
      justifyContent="center"
      alignItems="center"
      style={{
        padding: "32px 16px",
        minHeight: fill ? "100%" : undefined,
      }}
    >
      <Inner
        title={title}
        description={description}
        icon={icon}
        hint={hint}
        actions={actions}
      />
    </Flex>
  );

  if (bare) return body;
  return (
    <Surface elevation="raised" padding={0}>
      {body}
    </Surface>
  );
};

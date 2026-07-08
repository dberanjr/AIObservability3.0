import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import {
  AnalyticsIcon,
  ConnectorIcon,
  CriticalIcon,
  FilterIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import type { EmptyCause } from "./emptyCause";

export type { EmptyCause } from "./emptyCause";
export { emptyCause } from "./emptyCause";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

/**
 * Per-cause defaults: a distinct icon, a default headline, and a tint accent.
 * The accent is a Strato color token (or null for the neutral, non-alarming
 * treatment). It tints ONLY the icon bubble — the text stays in the muted
 * palette so an empty panel still reads as "a documented state", not a crash.
 */
interface CauseMeta {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Strato color token that tints the icon bubble, or null for neutral. */
  accent: string | null;
}

const CAUSE_META: Record<EmptyCause, CauseMeta> = {
  "no-activity": {
    icon: <AnalyticsIcon size={24} />,
    title: "No activity in this scope",
    description: "Nothing matched the current scope for this view.",
    accent: null,
  },
  "no-instrumentation": {
    icon: <ConnectorIcon size={24} />,
    title: "Available with instrumentation",
    description:
      "This view needs an attribute that isn't being emitted in the current scope.",
    accent: "var(--blue)",
  },
  "no-scope": {
    icon: <FilterIcon size={24} />,
    title: "Nothing in the current scope",
    description: "Try widening the timeframe or clearing filters.",
    accent: null,
  },
  error: {
    icon: <CriticalIcon size={24} />,
    title: "Couldn't load this",
    description: "This section failed to load.",
    accent: "var(--red)",
  },
  truncated: {
    icon: <WarningIcon size={24} />,
    title: "Scan budget reached",
    description:
      "Results are partial because the scan limit was reached. Raise the scan limit or narrow the scope to see everything.",
    accent: "var(--amber)",
  },
};

export interface EmptyStateProps {
  /**
   * Why the panel is empty — drives the default icon, headline, copy tone, and
   * a subtle icon-bubble tint (blue = instrumentation, amber = truncated,
   * red = error, neutral otherwise). Pair with `emptyCause(...)` to derive it
   * from a panel's error/limitHit/capability/scope booleans in one call.
   * Optional and fully backward compatible — omit it for a plain neutral empty.
   */
  cause?: EmptyCause;
  /** Headline. Optional when `cause` is given (a per-cause default is used). */
  title?: string;
  /** Body copy. Defaults to the per-cause description when `cause` is given. */
  description?: React.ReactNode;
  /** Optional decorative icon node — overrides the per-cause default icon. */
  icon?: React.ReactNode;
  /** Footnote-style hint shown below the description in smaller text. Ideal for
   *  naming the exact attribute to emit (e.g. gen_ai.usage.input_tokens). */
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
  accent,
  hint,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  accent: string | null;
  hint?: React.ReactNode;
  actions?: EmptyStateAction[];
}) => (
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
          background: accent
            ? `color-mix(in oklab, ${accent} 12%, var(--surface-3))`
            : "var(--surface-3)",
          color: accent ?? "var(--text-3)",
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
  cause,
  title,
  description,
  icon,
  hint,
  actions,
  bare,
  fill,
}: EmptyStateProps) => {
  const meta = cause ? CAUSE_META[cause] : undefined;
  // Caller values win; per-cause defaults fill the gaps. A neutral empty (no
  // cause, no icon) renders exactly as before — backward compatible.
  const resolvedTitle = title ?? meta?.title ?? "No data";
  const resolvedIcon = icon ?? meta?.icon;
  const resolvedDescription = description ?? meta?.description;
  const accent = meta?.accent ?? null;

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
        title={resolvedTitle}
        description={resolvedDescription}
        icon={resolvedIcon}
        accent={accent}
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

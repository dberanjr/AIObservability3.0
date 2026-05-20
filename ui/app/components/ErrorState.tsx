import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { CriticalIcon, RefreshIcon } from "@dynatrace/strato-icons";

export interface ErrorStateProps {
  /** Page-level title (e.g. "Couldn't load Pulse"). */
  title?: string;
  /** Error returned from a useDql hook (or any thrown Error). */
  error?: Error | null;
  /** Bound retry handler — typically `refetch` from useDql. */
  onRetry?: () => void;
  /** Render bare (no surrounding Surface) when nesting in another panel. */
  bare?: boolean;
}

const messageFor = (error?: Error | null): string => {
  if (!error) return "Unknown error";
  const text = error.message ?? String(error);
  return text.length > 220 ? `${text.slice(0, 219)}…` : text;
};

const Body = ({ title, error, onRetry }: ErrorStateProps) => (
  <Flex
    flexDirection="column"
    alignItems="center"
    gap={8}
    style={{ textAlign: "center", maxWidth: 540 }}
  >
    <div
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "color-mix(in oklab, var(--red) 12%, var(--surface-3))",
        color: "var(--red)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CriticalIcon size={20} />
    </div>
    <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
      {title ?? "Something went wrong"}
    </Heading>
    <Text
      style={{
        fontSize: 12,
        color: "var(--text-2)",
        fontFamily: "var(--mono, monospace)",
        wordBreak: "break-word",
      }}
    >
      {messageFor(error)}
    </Text>
    {onRetry && (
      <Button variant="default" onClick={onRetry} aria-label="Retry query">
        <Button.Prefix>
          <RefreshIcon />
        </Button.Prefix>
        Retry
      </Button>
    )}
  </Flex>
);

export const ErrorState = ({
  title,
  error,
  onRetry,
  bare,
}: ErrorStateProps) => {
  const content = (
    <Flex
      justifyContent="center"
      alignItems="center"
      style={{ padding: "32px 16px" }}
    >
      <Body title={title} error={error} onRetry={onRetry} />
    </Flex>
  );
  if (bare) return content;
  return (
    <Surface elevation="raised" padding={0}>
      {content}
    </Surface>
  );
};

export interface ErrorBannerProps {
  error: Error;
  onRetry?: () => void;
}

/**
 * Compact inline banner for surfacing errors at the top of a page without
 * collapsing the whole layout. Pages can render this alongside their normal
 * panels so partial data stays visible.
 */
export const ErrorBanner = ({ error, onRetry }: ErrorBannerProps) => (
  <Flex
    alignItems="center"
    gap={8}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      background: "color-mix(in oklab, var(--red) 10%, var(--surface))",
      border: "1px solid color-mix(in oklab, var(--red) 45%, transparent)",
    }}
    role="alert"
  >
    <CriticalIcon size={16} style={{ color: "var(--red)", flex: "0 0 auto" }} />
    <Text style={{ fontSize: 12, color: "var(--text)", flex: 1 }}>
      <strong>Query error.</strong> {messageFor(error)}
    </Text>
    {onRetry && (
      <Button variant="default" onClick={onRetry} aria-label="Retry query">
        <Button.Prefix>
          <RefreshIcon />
        </Button.Prefix>
        Retry
      </Button>
    )}
  </Flex>
);

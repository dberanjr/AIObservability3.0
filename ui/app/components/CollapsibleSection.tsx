/**
 * A lightweight collapsible section. Used to fold the FinOps surfaces into the
 * Models / FinOps tab below the model bubble chart and table without making the
 * page an endless scroll — each cost analysis is one click away but collapsed
 * by default (except where `defaultOpen`).
 */
import React, { useState } from "react";

export interface CollapsibleSectionProps {
  title: string;
  /** Small muted text shown next to the title (e.g. a count or hint). */
  subtitle?: React.ReactNode;
  /** Optional trailing node rendered at the far right of the header. */
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleSection = ({
  title,
  subtitle,
  aside,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      style={{
        border: "1px solid var(--border-subtle, var(--surface-3, #2b2b2b))",
        borderRadius: 8,
        background: "var(--surface-1, transparent)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          all: "unset",
          boxSizing: "border-box",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-1, inherit)",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 12,
            color: "var(--text-3)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 120ms ease",
          }}
        >
          ▸
        </span>
        <span>{title}</span>
        {subtitle && (
          <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--text-3)" }}>
            {subtitle}
          </span>
        )}
        {aside && <span style={{ marginLeft: "auto" }}>{aside}</span>}
      </button>
      {open && (
        <div style={{ padding: "4px 14px 16px" }}>{children}</div>
      )}
    </section>
  );
};

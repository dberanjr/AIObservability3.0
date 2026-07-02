/**
 * Orchestrator-tier framework chips for the AI Application Architecture map.
 *
 * Pure presentational: renders the detected orchestration frameworks (from
 * `useFrameworkBreakdown`) as clickable filter chips. Clicking a chip toggles
 * the framework on the global filter's `frameworks` dimension, which the
 * trace-scope resolver turns into a trace-id scope applied app-wide. An active
 * chip is outlined in the accent colour. Only the first MAX_VISIBLE are shown;
 * the rest collapse into a "+N more" hint.
 */
import React from "react";
import type { DetectedFramework } from "./frameworkBreakdown";

const MAX_VISIBLE = 5;

export const FrameworkChips = ({
  frameworks,
  selected,
  onToggle,
}: {
  frameworks: DetectedFramework[];
  selected: Set<string>;
  onToggle: (label: string) => void;
}) => {
  if (frameworks.length === 0) return null;
  const visible = frameworks.slice(0, MAX_VISIBLE);
  const overflow = frameworks.length - visible.length;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
      {visible.map((f) => {
        const active = selected.has(f.label);
        return (
          <button
            key={f.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(f.label);
            }}
            title={`${f.label} — ${f.count.toLocaleString()} spans. Click to filter the page.`}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 8,
              cursor: "pointer",
              border: active ? "2px solid var(--blue)" : "1px solid var(--border)",
              background: active
                ? "color-mix(in oklab, var(--blue) 12%, transparent)"
                : "var(--surface-2)",
              color: active ? "var(--blue)" : "var(--text)",
            }}
          >
            {f.label}
          </button>
        );
      })}
      {overflow > 0 && (
        <span style={{ fontSize: 12, color: "var(--text-3)", alignSelf: "center" }}>
          +{overflow} more
        </span>
      )}
    </div>
  );
};

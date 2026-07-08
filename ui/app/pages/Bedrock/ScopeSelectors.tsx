import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { ChevronDownIcon } from "@dynatrace/strato-icons";
import { useBedrockFacets } from "../../bedrock/useBedrock";
import type { Timeframe } from "../../scope/types";

export interface ScopeSelectorsProps {
  timeframe: Timeframe;
  accounts: string[];
  models: string[];
  setAccounts: React.Dispatch<React.SetStateAction<string[]>>;
  setModels: React.Dispatch<React.SetStateAction<string[]>>;
}

interface PickerOption {
  value: string;
  label: string;
  /** Hover text — the Model picker uses this to reveal the raw modelIds a
   *  grouped/deduped option collapses (see `ScopeSelectors` doc comment). */
  title?: string;
}

interface PickerProps {
  label: string;
  options: PickerOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  isLoading: boolean;
  emptyHint: string;
}

const triggerStyle = (active: boolean): React.CSSProperties => ({
  all: "unset",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
  background: active ? "color-mix(in oklab, var(--blue) 8%, var(--surface))" : "var(--surface)",
  fontSize: 12,
  color: "var(--text)",
  fontWeight: 500,
  whiteSpace: "nowrap",
});

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  cursor: "pointer",
};

const popoverTextStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-3)", padding: 12 };

/**
 * Checklist popover shared by the Account and Model pickers — mirrors
 * GlobalAttributeFilter's value popover (click-outside-to-close, checkbox
 * rows, a text search box) rather than pulling in a new multi-select
 * dependency the app doesn't otherwise have.
 */
const Picker = ({ label, options, selected, onChange, isLoading, emptyHint }: PickerProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  }, [options, search]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const buttonLabel =
    selected.length === 0
      ? `All ${label.toLowerCase()}s`
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} ${label.toLowerCase()}s`;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Filter by ${label.toLowerCase()}`}
        style={triggerStyle(selected.length > 0)}
      >
        <span style={{ color: "var(--text-3)" }}>{label}:</span>
        {buttonLabel}
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            width: 280,
            maxHeight: 360,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
            zIndex: 10000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <input
            autoFocus
            type="text"
            placeholder={`Search ${label.toLowerCase()}s…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              all: "unset",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--text)",
            }}
          />
          <div style={{ overflow: "auto", flex: 1 }}>
            {isLoading && options.length === 0 ? (
              <Text style={popoverTextStyle}>Loading…</Text>
            ) : filtered.length === 0 ? (
              <Text style={popoverTextStyle}>{emptyHint}</Text>
            ) : (
              filtered.map((o) => (
                <label key={o.value} title={o.title ?? o.value} style={rowStyle}>
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => toggle(o.value)}
                    style={{ cursor: "pointer", width: 14, height: 14 }}
                  />
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.label}
                  </span>
                </label>
              ))
            )}
          </div>
          <Flex
            justifyContent="space-between"
            alignItems="center"
            style={{ padding: "6px 12px", borderTop: "1px solid var(--border)" }}
          >
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              style={{
                all: "unset",
                cursor: selected.length === 0 ? "default" : "pointer",
                fontSize: 11,
                color: selected.length === 0 ? "var(--text-4)" : "var(--blue)",
              }}
            >
              Clear
            </button>
            <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>{selected.length} selected</Text>
          </Flex>
        </div>
      )}
    </div>
  );
};

/**
 * Account + Model scope selectors (D6), wired to `setAccounts`/`setModels`
 * in BedrockPage. Options come from `useBedrockFacets(timeframe)` —
 * deliberately unscoped by the CURRENT account/model selection (see that
 * hook's and its underlying query's doc comments in bedrock/queries.ts), so
 * picking one model doesn't prune the other models out of its own picker's
 * option list.
 *
 * The Model picker is deduped by FRIENDLY label (`BedrockFacets.modelGroups`
 * — see parse.ts): several raw modelIds (an on-demand inference-profile id
 * plus its account-specific ARN forms) can all render the same
 * `shortModelName`, e.g. "claude-sonnet-4-6" showing up 3x for one real
 * model. Each picker option is one GROUP; picking it scopes ALL of that
 * group's raw ids. `scope.models` therefore always stays a raw-id list (so it
 * round-trips into `bedrockLogBase`'s `b[modelId]` filter unchanged) — the
 * grouping/expansion only lives in this component's selected/onChange glue.
 * The Account picker has no such collision (raw account ids are already
 * unique), so its value is the raw id directly.
 */
export const ScopeSelectors = ({
  timeframe,
  accounts,
  models,
  setAccounts,
  setModels,
}: ScopeSelectorsProps) => {
  const { accounts: accountOpts, modelGroups, isLoading } = useBedrockFacets(timeframe);

  const accountOptions = useMemo<PickerOption[]>(
    () => accountOpts.map((a) => ({ value: a, label: a })),
    [accountOpts],
  );

  // modelGroups is already sorted by label (parseFacets); labels are unique
  // within it, so `value` doubles as the label. The row's hover `title`
  // reveals the raw ids a label collapses.
  const modelOptions = useMemo<PickerOption[]>(
    () => modelGroups.map((g) => ({ value: g.label, label: g.label, title: g.ids.join(", ") })),
    [modelGroups],
  );

  // A group reads as "selected" only when ALL of its raw ids are in scope —
  // avoids a false-positive check mark from a partial/stale overlap (e.g. a
  // URL-restored selection missing one account-specific ARN form).
  const selectedModelLabels = useMemo(
    () => modelGroups.filter((g) => g.ids.every((id) => models.includes(id))).map((g) => g.label),
    [modelGroups, models],
  );

  const handleModelChange = (labels: string[]) => {
    const labelSet = new Set(labels);
    setModels(modelGroups.filter((g) => labelSet.has(g.label)).flatMap((g) => g.ids));
  };

  return (
    <Flex alignItems="center" gap={8}>
      <Picker
        label="Account"
        options={accountOptions}
        selected={accounts}
        onChange={setAccounts}
        isLoading={isLoading}
        emptyHint="No accounts found in this timeframe."
      />
      <Picker
        label="Model"
        options={modelOptions}
        selected={selectedModelLabels}
        onChange={handleModelChange}
        isLoading={isLoading}
        emptyHint="No models found in this timeframe."
      />
    </Flex>
  );
};

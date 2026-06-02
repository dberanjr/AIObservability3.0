import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { FilterIcon, PlusIcon, XmarkIcon } from "@dynatrace/strato-icons";
import { useGlobalFilters } from "../scope/GlobalFilterContext";
import { useScope } from "../scope/ScopeContext";
import { useScopedDql } from "../scope/useScopedDql";
import { dqlTimeArg, dqlEscape } from "../scope/queries";
import type { Timeframe } from "../scope/types";

/**
 * Curated attribute keys surfaced as suggestions. The user can also type ANY
 * span attribute (gen_ai.*, langchain.*, etc.) — these are just the common
 * ones for this AI workload. Free-text entry is always allowed.
 */
const ATTRIBUTE_SUGGESTIONS: string[] = [
  "service.name",
  "gen_ai.agent.name",
  "gen_ai.request.model",
  "gen_ai.provider.name",
  "gen_ai.operation.name",
  "gen_ai.tool.name",
  "gen_ai.response.finish_reasons",
  "trace.id",
  "span.id",
  "span.name",
  "span.kind",
  "k8s.namespace.name",
  "k8s.cluster.name",
  "k8s.workload.name",
  "host.name",
  "dt.host_group.id",
  "http.response.status_code",
  "otel.scope.name",
  "telemetry.sdk.name",
];

const SAFE_ATTR_RE = /^[A-Za-z][A-Za-z0-9_.]*$/;

/**
 * High-cardinality attributes (trace/span ids and any *.id / *_id) — these have
 * far too many distinct values to enumerate, and discovery is slow, so we don't
 * pre-fetch them: values are only queried once the user types a search term.
 */
const isHighCardinality = (attribute: string): boolean =>
  /(^|[._])(trace|span)([._]id)$/i.test(attribute) ||
  /\.id$/i.test(attribute) ||
  /_id$/i.test(attribute);

const buildValuesQuery = (
  attribute: string,
  timeframe: Timeframe,
  search?: string,
): string => {
  const to = timeframe.to ?? "now()";
  const term = (search ?? "").trim();
  const searchClause = term
    ? `| filter contains(toString(${attribute}), "${dqlEscape(term)}")`
    : "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to)}, scanLimitGBytes: 200
| filter isNotNull(${attribute})
${searchClause}
| summarize cnt = count(), by: { v = toString(${attribute}) }
| sort cnt desc
| limit 200
`.trim();
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 8px",
  borderRadius: 6,
  background: "var(--blue-surface, color-mix(in oklab, var(--blue) 12%, transparent))",
  border: "1px solid color-mix(in oklab, var(--blue) 35%, transparent)",
  fontSize: 11.5,
  color: "var(--text)",
  whiteSpace: "nowrap",
  maxWidth: 360,
};

/** Popover body: pick an attribute, then its values. */
const AddFilterPopover = ({
  timeframe,
  onClose,
}: {
  timeframe: Timeframe;
  onClose: () => void;
}) => {
  const { filters, setConditionValues } = useGlobalFilters();
  const [attribute, setAttribute] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [valueSearch, setValueSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // Seed selection from any existing condition for the chosen attribute.
  useEffect(() => {
    if (!attribute) return;
    const existing = filters.conditions.find((c) => c.attribute === attribute);
    setSelected(existing?.values ?? []);
  }, [attribute, filters.conditions]);

  // Debounce the value search by 1s so typing in a high-cardinality field
  // (trace.id, span.id…) doesn't fire a query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(valueSearch), 1000);
    return () => window.clearTimeout(t);
  }, [valueSearch]);

  const highCard = !!attribute && isHighCardinality(attribute);
  // For high-cardinality attributes we DON'T pre-fetch: discovery only runs once
  // the user has typed a (debounced) search term, and it's narrowed server-side.
  const runQuery =
    !!attribute &&
    SAFE_ATTR_RE.test(attribute) &&
    (!highCard || debouncedSearch.trim().length > 0);
  const valuesQuery = runQuery
    ? buildValuesQuery(attribute!, timeframe, highCard ? debouncedSearch : undefined)
    : "";
  const { data, isLoading } = useScopedDql<{ v?: string }>(valuesQuery, {
    enabled: !!valuesQuery,
    staleTime: 60_000,
    // Always show the full value list, unaffected by other active filters.
    ignoreGlobalFilter: true,
  });
  // Loading only counts while a query is actually in flight (and, for
  // high-cardinality, while the debounce has caught up to the input).
  const showLoading =
    isLoading && runQuery && (!highCard || debouncedSearch === valueSearch);

  const allValues = useMemo(
    () =>
      (data?.records ?? [])
        .map((r) => r.v)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    [data],
  );
  const filteredValues = valueSearch
    ? allValues.filter((v) => v.toLowerCase().includes(valueSearch.toLowerCase()))
    : allValues;

  const typed = valueSearch.trim();
  // Selected values not present in the discovered list (typed ids, or values
  // seeded from an existing condition) — shown as checked rows so the current
  // selection is always visible/removable.
  const extraSelected = selected.filter((v) => !filteredValues.includes(v));
  const canAddTyped =
    typed.length > 0 && !filteredValues.includes(typed) && !selected.includes(typed);

  const keySuggestions = keyInput
    ? ATTRIBUTE_SUGGESTIONS.filter((k) =>
        k.toLowerCase().includes(keyInput.toLowerCase()),
      )
    : ATTRIBUTE_SUGGESTIONS;
  const typedKeyValid = SAFE_ATTR_RE.test(keyInput.trim());

  const toggleValue = (v: string) =>
    setSelected((cur) =>
      cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v],
    );

  const apply = () => {
    if (attribute) setConditionValues(attribute, selected);
    onClose();
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 6,
        width: 320,
        maxHeight: 420,
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
      {!attribute ? (
        <>
          <input
            autoFocus
            type="text"
            placeholder="Filter on attribute… (type any span field)"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typedKeyValid) {
                setAttribute(keyInput.trim());
                setKeyInput("");
              }
            }}
            style={{
              all: "unset",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--text)",
            }}
          />
          <Text
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              padding: "8px 12px 4px",
            }}
          >
            Key suggestions
          </Text>
          <div style={{ overflow: "auto" }}>
            {typedKeyValid &&
              !ATTRIBUTE_SUGGESTIONS.includes(keyInput.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setAttribute(keyInput.trim());
                    setKeyInput("");
                  }}
                  style={rowBtnStyle}
                >
                  Use “{keyInput.trim()}”
                </button>
              )}
            {keySuggestions.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setAttribute(k)}
                style={rowBtnStyle}
              >
                {k}
              </button>
            ))}
            {keySuggestions.length === 0 && !typedKeyValid && (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: 12 }}>
                No matches
              </Text>
            )}
          </div>
        </>
      ) : (
        <>
          <Flex
            alignItems="center"
            gap={6}
            style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}
          >
            <button
              type="button"
              onClick={() => setAttribute(null)}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 11,
                color: "var(--blue)",
              }}
            >
              ‹ key
            </button>
            <Text
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attribute}
            </Text>
          </Flex>
          <input
            autoFocus
            type="text"
            placeholder={highCard ? "Type a value (e.g. a full id)…" : "Filter values…"}
            value={valueSearch}
            onChange={(e) => setValueSearch(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the exact typed value even if discovery has no match.
              if (e.key === "Enter" && canAddTyped) {
                toggleValue(typed);
                setValueSearch("");
              }
            }}
            style={{
              all: "unset",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--text)",
            }}
          />
          <div style={{ overflow: "auto", flex: 1 }}>
            {/* Add the exact typed value — honored regardless of matches. */}
            {canAddTyped && (
              <button
                type="button"
                onClick={() => {
                  toggleValue(typed);
                  setValueSearch("");
                }}
                style={{ ...rowBtnStyle, color: "var(--blue)", fontWeight: 600 }}
              >
                ＋ Use “{typed}”
              </button>
            )}
            {/* Already-selected values not in the discovered list. */}
            {extraSelected.map((v) => (
              <label key={`sel-${v}`} style={valueRowStyle}>
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggleValue(v)}
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
                  {v}
                </span>
              </label>
            ))}
            {showLoading ? (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: 12 }}>
                Loading values…
              </Text>
            ) : filteredValues.length === 0 ? (
              <Text style={{ fontSize: 11, color: "var(--text-3)", padding: 12 }}>
                {highCard && !debouncedSearch.trim()
                  ? "Type a value above to search — or press Enter to use it as-is."
                  : valueSearch
                    ? "No matches — use the option above to apply it anyway."
                    : "No values found"}
              </Text>
            ) : (
              filteredValues.map((v) => (
                <label key={v} style={valueRowStyle}>
                  <input
                    type="checkbox"
                    checked={selected.includes(v)}
                    onChange={() => toggleValue(v)}
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
                    {v}
                  </span>
                </label>
              ))
            )}
          </div>
          <Flex
            justifyContent="space-between"
            alignItems="center"
            style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}
          >
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              {selected.length} selected
            </Text>
            <button
              type="button"
              onClick={apply}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "5px 14px",
                borderRadius: 6,
                background: "var(--blue)",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Apply
            </button>
          </Flex>
        </>
      )}
    </div>
  );
};

const rowBtnStyle: React.CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  cursor: "pointer",
  padding: "7px 12px",
  fontSize: 12,
  color: "var(--text)",
};

const valueRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  cursor: "pointer",
  borderBottom: "1px solid var(--border-subtle)",
};

export const GlobalAttributeFilter = () => {
  const { scope } = useScope();
  const { filters, removeCondition } = useGlobalFilters();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap", minWidth: 0 }}>
      <div ref={rootRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            fontSize: 12,
            color: "var(--text)",
            fontWeight: 500,
          }}
        >
          <FilterIcon size={14} />
          Filter
          <PlusIcon size={12} />
        </button>
        {open && (
          <AddFilterPopover
            timeframe={scope.timeframe}
            onClose={() => setOpen(false)}
          />
        )}
      </div>

      {filters.conditions.map((c) => (
        <span key={c.attribute} style={chipStyle}>
          <span style={{ fontWeight: 600 }}>{c.attribute}</span>
          <span
            style={{
              color: "var(--text-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {c.values.length <= 2
              ? c.values.join(", ")
              : `${c.values.slice(0, 2).join(", ")} +${c.values.length - 2}`}
          </span>
          <button
            type="button"
            aria-label={`Remove ${c.attribute} filter`}
            onClick={() => removeCondition(c.attribute)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "inline-flex",
              color: "var(--text-3)",
            }}
          >
            <XmarkIcon size={12} />
          </button>
        </span>
      ))}
    </Flex>
  );
};

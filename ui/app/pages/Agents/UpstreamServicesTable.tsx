import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import { FilterTrigger } from "../../components/FilterTrigger";
import type { UseUpstreamServicesResult } from "./useUpstreamServices";

const INFO =
  "Monitored services that call these AI services, read from Smartscape topology (calls edges) rather than span attributes. Empty when the AI services are only reached by external clients or via messaging/async fan-out not captured as a service-level call.";

export interface UpstreamServicesTableProps {
  result: UseUpstreamServicesResult;
}

export const UpstreamServicesTable = ({ result }: UpstreamServicesTableProps) => {
  // Collapse-when-empty, mirroring the Orchestration & runtime nodes section:
  // when there are no upstream callers the panel folds to a single header row
  // so it doesn't take a full empty-state card at the bottom of the page.
  const isEmpty = !result.isLoading && result.rows.length === 0;
  const [open, setOpen] = useState(false);

  if (isEmpty) {
    return (
      <Surface elevation="raised" padding={0}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ all: "unset", cursor: "pointer", width: "100%" }}
        >
          <Flex alignItems="center" gap={8} style={{ padding: "10px 16px" }}>
            {open ? (
              <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
            ) : (
              <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
            )}
            <Text style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
              Upstream services (0)
            </Text>
            <InfoTooltip text={INFO} />
            <Flex flexGrow={1} />
            {!open && (
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                No monitored upstream callers in Smartscape
              </Text>
            )}
          </Flex>
        </button>
        {open && (
          <Flex
            style={{
              padding: "10px 16px 16px",
              borderTop: "1px solid var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <Text style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
              No upstream callers found in Smartscape for these AI services — they
              aren't called by other <em>monitored</em> services (callers are
              external clients, or the dependency isn't captured as a
              service-level call). This reads Smartscape <code>calls</code> edges,
              not span attributes. Upstream attribution reads{" "}
              <code>parent.service.name</code> from each agent span; agents called
              over messaging or async fan-out won't appear until span links
              graduate from the topology session.
            </Text>
          </Flex>
        )}
      </Surface>
    );
  }

  return (
    <Surface elevation="raised" padding={0}>
      <Flex flexDirection="column" gap={0}>
        <Flex
          flexDirection="column"
          gap={2}
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <Flex alignItems="center" gap={6}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Upstream services
            </Heading>
            <InfoTooltip text={INFO} />
          </Flex>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Services that call these AI services — from Smartscape topology
          </Text>
        </Flex>

        <Flex
          alignItems="center"
          style={{
            padding: "6px 16px",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          <span style={{ flex: 1 }}>Upstream service</span>
          <span style={{ width: 90, textAlign: "right" }}>AI services</span>
        </Flex>

        {result.isLoading && result.rows.length === 0 ? (
          <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 28 }} />
            ))}
          </Flex>
        ) : (
          result.rows.map((r) => (
            <Flex
              key={r.upstream}
              alignItems="center"
              style={{ padding: "6px 16px", borderTop: "1px solid var(--border)" }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <FilterTrigger
                  attribute="service.name"
                  value={r.upstream}
                  label="upstream service"
                >
                  {r.upstream}
                </FilterTrigger>
              </Text>
              <Text
                style={{
                  width: 90,
                  textAlign: "right",
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12.5,
                  fontVariantNumeric: "tabular-nums",
                }}
                title={r.targets.join(", ")}
              >
                {fmtCount(r.services)}
              </Text>
            </Flex>
          ))
        )}

        <Flex
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
            Upstream attribution reads <code>parent.service.name</code> from each
            agent span. Agents called over messaging or async fan-out won't appear
            until span links graduate from the topology session.
          </Text>
        </Flex>
      </Flex>
    </Surface>
  );
};

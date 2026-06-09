import React from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { CheckmarkIcon, ExternalLinkIcon, ArrowRightIcon } from "@dynatrace/strato-icons";
import { fmtCount, fmtPercent } from "../../data/format";
import type { AuditSection } from "./catalog";
import type { AttrResult } from "./useAttributeAudit";
import { buildDetail, type DetailLink } from "./details";

const PRESENT = "var(--green-2)";
const MISSING = "var(--red)";

const VerdictPill = ({ present }: { present: boolean }) => {
  const color = present ? PRESENT : MISSING;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
      }}
    >
      {present ? "PRESENT — emitting" : "MISSING — not emitting"}
    </span>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-3)",
    }}
  >
    {children}
  </Text>
);

const LinkRow = ({ link }: { link: DetailLink }) => (
  <a
    href={link.url}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 12,
      color: "var(--blue)",
      textDecoration: "none",
    }}
  >
    <ExternalLinkIcon size={13} />
    {link.label}
  </a>
);

export interface AttributeDetailModalProps {
  show: boolean;
  onClose: () => void;
  section: AuditSection | null;
  attr: AttrResult | null;
}

export const AttributeDetailModal = ({
  show,
  onClose,
  section,
  attr,
}: AttributeDetailModalProps) => {
  // Keep hooks unconditional; render nothing meaningful until populated.
  const detail =
    section && attr ? buildDetail(section, attr.spec.name, attr.spec.what) : null;

  return (
    <Modal
      show={show}
      onDismiss={onClose}
      size="medium"
      title={attr ? attr.spec.name : "Attribute"}
      footer={
        <Flex justifyContent="space-between" alignItems="center" gap={8}>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {section ? `Section ${section.number} · ${section.short}` : ""}
          </Text>
          <Button onClick={onClose} variant="accent">
            Close
          </Button>
        </Flex>
      }
    >
      {section && attr && detail && (
        <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
          {/* Status strip */}
          <Flex alignItems="center" gap={12} style={{ flexWrap: "wrap" }}>
            <VerdictPill present={attr.present} />
            <Text style={{ fontSize: 12, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
              {attr.present
                ? `${fmtCount(attr.spans)} spans · ${fmtPercent(attr.share * 100, 1)} of the ${section.short} population`
                : `Not seen on any ${section.short} span in the selected window`}
            </Text>
          </Flex>

          {/* What it is */}
          <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>
            {attr.spec.what}.
          </Text>

          {/* Why it matters */}
          <Flex flexDirection="column" gap={6}>
            <SectionLabel>Why it matters</SectionLabel>
            <Text style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>
              {detail.why}
            </Text>
          </Flex>

          {/* Benefits */}
          <Flex flexDirection="column" gap={6}>
            <SectionLabel>Benefits</SectionLabel>
            <Flex flexDirection="column" gap={6}>
              {detail.benefits.map((b, i) => (
                <Flex key={i} alignItems="flex-start" gap={8}>
                  <CheckmarkIcon size={14} style={{ color: PRESENT, flex: "0 0 auto", marginTop: 2 }} />
                  <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>{b}</Text>
                </Flex>
              ))}
            </Flex>
          </Flex>

          {/* Synergy */}
          <Flex flexDirection="column" gap={6}>
            <SectionLabel>How it ties together</SectionLabel>
            <Flex
              alignItems="flex-start"
              gap={8}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "color-mix(in oklab, var(--blue) 7%, var(--surface))",
                border: "1px solid color-mix(in oklab, var(--blue) 22%, transparent)",
              }}
            >
              <ArrowRightIcon size={14} style={{ color: "var(--blue)", flex: "0 0 auto", marginTop: 2 }} />
              <Text style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>
                {detail.synergy}
              </Text>
            </Flex>
          </Flex>

          {/* Best practices */}
          {detail.bestPractices.length > 0 && (
            <Flex flexDirection="column" gap={6}>
              <SectionLabel>Industry best practices</SectionLabel>
              <Flex flexDirection="column" gap={8}>
                {detail.bestPractices.map((bp, i) => (
                  <Flex key={i} flexDirection="column" gap={2}>
                    <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                      • {bp.text}
                    </Text>
                    {bp.ref && (
                      <span style={{ paddingLeft: 12 }}>
                        <LinkRow link={bp.ref} />
                      </span>
                    )}
                  </Flex>
                ))}
              </Flex>
            </Flex>
          )}

          {/* Learn more */}
          {detail.links.length > 0 && (
            <Flex flexDirection="column" gap={6}>
              <SectionLabel>Learn more</SectionLabel>
              <Flex flexDirection="column" gap={6}>
                {detail.links.map((l) => (
                  <LinkRow key={l.url} link={l} />
                ))}
              </Flex>
              <Text style={{ fontSize: 10.5, color: "var(--text-4)", lineHeight: 1.4 }}>
                Links point to vendor-neutral open standards (OpenTelemetry, Model
                Context Protocol).
              </Text>
            </Flex>
          )}
        </Flex>
      )}
    </Modal>
  );
};

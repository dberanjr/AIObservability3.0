/**
 * Centered popup for a finding / enrichment / scope / loop detail. Pure
 * presentation — the ModalDetail is resolved from live data by resolveDetail.
 */
import React from "react";
import { Spark } from "./Spark";
import type { DetailDrill, DetailSeverity, ModalDetail } from "./getDetail";

const SEV_COLOR: Record<DetailSeverity, string> = {
  critical: "var(--red)",
  warning: "var(--amber)",
  good: "var(--green-2)",
  info: "#474fcf",
  neutral: "var(--text-3)",
};

interface Props {
  detail: ModalDetail | null;
  onClose: () => void;
  onDrill: (drill: DetailDrill) => void;
}

export const DetailModal = ({ detail, onClose, onDrill }: Props) => {
  const open = !!detail;
  return (
    <>
      <div className={`am-scrim${open ? " open" : ""}`} onClick={onClose} />
      <div className={`am-modal${open ? " open" : ""}`} role="dialog" aria-modal="true">
        {detail && (
          <>
            <div className="am-modal-head">
              <span className="am-modal-sev" style={{ background: SEV_COLOR[detail.severity] }} />
              <div style={{ flex: 1 }}>
                <div className="am-modal-title">{detail.title}</div>
                {detail.scope && <div className="am-modal-scope">{detail.scope}</div>}
              </div>
              <button type="button" className="am-drawer-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>
            <div className="am-modal-body">
              {detail.what && <p className="am-modal-what">{detail.what}</p>}
              {detail.series && detail.series.length > 1 && (
                <div className="am-dsection">
                  <div className="am-dsection-h">{detail.seriesLabel ?? "Span volume"}</div>
                  <div style={{ width: "100%" }}>
                    <Spark
                      data={detail.series}
                      color={SEV_COLOR[detail.severity]}
                      width={400}
                      height={56}
                      fluid
                      labels={detail.seriesLabels}
                    />
                  </div>
                </div>
              )}
              {detail.why && (
                <div className="am-dsection">
                  <div className="am-dsection-h">Why it matters</div>
                  <p className="am-modal-why">{detail.why}</p>
                </div>
              )}
              {detail.metrics.length > 0 && (
                <div className="am-modal-metrics">
                  {detail.metrics.map((m, i) => (
                    <div className="am-metric" key={i}>
                      <div className="am-metric-k">{m.k}</div>
                      <div className="am-metric-v">{m.v}</div>
                    </div>
                  ))}
                </div>
              )}
              {detail.drill && (
                <div className="am-modal-actions">
                  <button
                    type="button"
                    className="am-cta"
                    onClick={() => {
                      const d = detail.drill!;
                      onClose();
                      onDrill(d);
                    }}
                  >
                    ↗ Open in {detail.drill.label}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

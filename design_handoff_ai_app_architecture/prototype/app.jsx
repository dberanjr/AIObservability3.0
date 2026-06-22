/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakColor */
const { useState, useMemo, useEffect, useContext } = React;
const DetailCtx = React.createContext(() => {});
const { LENSES, LAYERS, SPARK, SCOPE } = window.AIOBS;

/* ── tiny inline icons (Strato-style line icons) ───────────── */
const Ic = {
  chevDown: (p) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9l6 6 6-6" /></svg>
  ),
  chevDownThin: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9l6 6 6-6" /></svg>
  ),
  left: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 18l-6-6 6-6" /></svg>),
  right: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 18l6-6-6-6" /></svg>),
  cube: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7l8.7 5 8.7-5M12 22V12" /></svg>),
  filter: (p) => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" /></svg>),
  plus: (p) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>),
  reset: (p) => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>),
  gear: (p) => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>),
  ext: (p) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" /></svg>),
  arrowR: (p) => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  bolt: (p) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" /></svg>),
};

const NAV = ["Pulse", "Explorer", "Agents", "Prompts", "Models / FinOps"];
const STATUS_VAR = { critical: "var(--critical)", good: "var(--good)", warning: "var(--warning)", muted: "var(--muted)" };
const fmt = (n) => n.toLocaleString("en-US");

/* ── Header ────────────────────────────────────────────────── */
function Header({ tweaksOn, onTweaks }) {
  return (
    <header className="hdr">
      <div className="hdr-brand">
        <div className="hdr-logo">AI</div>
        <span className="hdr-title">AI Observability 3.0 App</span>
      </div>
      <nav className="hdr-nav">
        {NAV.map((n) => (
          <button key={n} className={"nav-item" + (n === "Pulse" ? " active" : "")} title={n === "Pulse" ? "" : n + " (not in this mock)"}>{n}</button>
        ))}
      </nav>
      <div className="hdr-actions">
        <button className="tf-step" aria-label="Previous window">{Ic.left()}</button>
        <button className="tf">{SCOPE.range}{Ic.chevDown({ style: { color: "var(--text-subdued)" } })}</button>
        <button className="tf-step" aria-label="Next window">{Ic.right()}</button>
        <button className="hdr-link">Model Rates</button>
        <button className={"tweaks-btn" + (tweaksOn ? " on" : "")} onClick={onTweaks}>{Ic.gear()} Tweaks</button>
      </div>
    </header>
  );
}

/* ── Scope toolbar + context strip ─────────────────────────── */
function Toolbar() {
  return (
    <div className="toolbar">
      <div className="tb-group">
        <span className="tb-label">Segments</span>
        <button className="tb-control"><span className="tb-icon">{Ic.cube()}</span>{Ic.chevDown({ style: { color: "var(--text-subdued)" } })}</button>
      </div>
      <div className="tb-group">
        <span className="tb-label">Sampling</span>
        <button className="tb-control">None (every record){Ic.chevDown({ style: { color: "var(--text-subdued)" } })}</button>
      </div>
      <div className="tb-group">
        <span className="tb-label">Scan limit</span>
        <button className="tb-control">5 TB{Ic.chevDown({ style: { color: "var(--text-subdued)" } })}</button>
      </div>
      <div className="tb-group">
        <span className="tb-label">Filters</span>
        <button className="tb-control"><span className="tb-icon">{Ic.filter()}</span>Filter {Ic.plus()}</button>
      </div>
      <button className="tb-reset">{Ic.reset()} Reset</button>
    </div>
  );
}
function Context() {
  return (
    <div className="ctx">
      <span><b>Fleet-wide</b></span>
      <div className="ctx-right">
        <span>Scope further with Segments in the toolbar above.</span>
        <span>Last refreshed {SCOPE.refreshed}</span>
      </div>
    </div>
  );
}

/* ── Connectors ────────────────────────────────────────────── */
// Vertical connector. fork=true splits to two columns at 25% / 75%.
function VConnector({ flow, status, show, anim, fork }) {
  const w = 2 + flow * 7;
  const color = STATUS_VAR[status] || "var(--border-strong)";
  if (!show) {
    return <div className="connector"><div className="conn-chevron">{Ic.chevDownThin()}</div></div>;
  }
  return (
    <div className="connector">
      <svg className="conn-svg" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ "--flow-color": color }}>
        {fork ? (
          <g>
            <path className="conn-line lit" d="M500 0 L500 38 Q500 50 470 50 L280 50 Q250 50 250 64 L250 100" strokeWidth={w} vectorEffect="non-scaling-stroke" />
            <path className="conn-line lit" d="M500 0 L500 38 Q500 50 530 50 L720 50 Q750 50 750 64 L750 100" strokeWidth={w} vectorEffect="non-scaling-stroke" />
            <path className={"conn-flow" + (anim ? " anim" : "")} d="M500 0 L500 38 Q500 50 470 50 L280 50 Q250 50 250 64 L250 100" strokeWidth={Math.max(2, w - 3)} vectorEffect="non-scaling-stroke" />
            <path className={"conn-flow" + (anim ? " anim" : "")} d="M500 0 L500 38 Q500 50 530 50 L720 50 Q750 50 750 64 L750 100" strokeWidth={Math.max(2, w - 3)} vectorEffect="non-scaling-stroke" />
          </g>
        ) : (
          <g>
            <path className="conn-line lit" d="M500 0 L500 100" strokeWidth={w} vectorEffect="non-scaling-stroke" />
            <path className={"conn-flow" + (anim ? " anim" : "")} d="M500 0 L500 100" strokeWidth={Math.max(2, w - 3)} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
    </div>
  );
}
// Horizontal connector for flow layout.
function HConnector({ flow, status, show, anim }) {
  const w = 2 + flow * 7;
  const color = STATUS_VAR[status] || "var(--border-strong)";
  if (!show) {
    return <div className="flow-edge" style={{ display: "grid", placeItems: "center", color: "var(--text-faint)" }}>{Ic.arrowR()}</div>;
  }
  return (
    <div className="flow-edge">
      <svg className="conn-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ "--flow-color": color, height: "100%" }}>
        <path className="conn-line lit" d="M0 50 L100 50" strokeWidth={w} vectorEffect="non-scaling-stroke" />
        <path className={"conn-flow" + (anim ? " anim" : "")} d="M0 50 L100 50" strokeWidth={Math.max(2, w - 3)} vectorEffect="non-scaling-stroke" style={{ strokeDasharray: "2 14" }} />
      </svg>
    </div>
  );
}

/* ── Layer card ────────────────────────────────────────────── */
function LayerCard({ layer, lens, variant, onClick }) {
  const d = layer.lens[lens] || layer.lens.overview;
  const compact = variant === "compact";
  const onOpenDetail = useContext(DetailCtx);
  return (
    <div className="card" data-status={d.status} data-otel={layer.otel === false ? "false" : "true"} onClick={() => onClick(layer)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(layer); } }}>
      <div className="card-top">
        <span className="dot" />
        <span className="card-name">{layer.name}</span>
        <span className="card-info" aria-hidden="true">i</span>
      </div>
      {layer.otel === false ? (
        <div className="desc">
          <div className="desc-note">{layer.note}</div>
          {!compact && <div style={{ marginTop: 4 }}>{layer.desc}</div>}
        </div>
      ) : (
        <>
          <div className="headline">
            <span className="headline-num">{d.headline}</span>
            <span className="headline-sub">{d.sub}</span>
          </div>
          {d.badges && d.badges.length > 0 && (
            <div className="badges">
              {d.badges.map((bd, i) => {
                const o = typeof bd === "string" ? { t: bd, tone: "gray" } : bd;
                return <button key={i} className={"badge" + (i === 0 && (d.status === "critical" || d.status === "warning") ? " lead" : "")}
                  onClick={(e) => { e.stopPropagation(); onOpenDetail({ badge: o, node: layer.name, drill: layer.drill }); }}>{o.t}</button>;
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Layered view (faithful to screenshot) ─────────────────── */
function LayeredView({ lens, conn, anim, onPick }) {
  const [client, gateway, orch, agent, tools, llm] = LAYERS;
  return (
    <div className="diagram">
      <div className="layers">
        <div className="layer-row"><LayerCard layer={client} lens={lens} variant="full" onClick={onPick} /></div>
        <VConnector flow={client.flow} status={client.lens[lens].status} show={conn} anim={anim} />
        <div className="layer-row"><LayerCard layer={gateway} lens={lens} variant="full" onClick={onPick} /></div>
        <VConnector flow={gateway.flow} status={orch.lens[lens].status} show={conn} anim={anim} />
        <div className="layer-row"><LayerCard layer={orch} lens={lens} variant="full" onClick={onPick} /></div>
        <VConnector flow={orch.flow} status={orch.lens[lens].status} show={conn} anim={anim} />
        <div className="layer-row"><LayerCard layer={agent} lens={lens} variant="full" onClick={onPick} /></div>
        <VConnector flow={agent.flow} status={agent.lens[lens].status} show={conn} anim={anim} fork />
        <div className="layer-row layer-split">
          <LayerCard layer={tools} lens={lens} variant="full" onClick={onPick} />
          <LayerCard layer={llm} lens={lens} variant="full" onClick={onPick} />
        </div>
      </div>
    </div>
  );
}

/* ── Flow view (horizontal pipeline) ───────────────────────── */
function FlowView({ lens, conn, anim, onPick }) {
  const [client, gateway, orch, agent, tools, llm] = LAYERS;
  return (
    <div className="flow-wrap">
      <div className="flow-track">
        <div className="flow-col"><div className="flow-card"><LayerCard layer={client} lens={lens} variant="compact" onClick={onPick} /></div></div>
        <HConnector flow={client.flow} status={client.lens[lens].status} show={conn} anim={anim} />
        <div className="flow-col"><div className="flow-card"><LayerCard layer={gateway} lens={lens} variant="compact" onClick={onPick} /></div></div>
        <HConnector flow={gateway.flow} status={orch.lens[lens].status} show={conn} anim={anim} />
        <div className="flow-col"><div className="flow-card"><LayerCard layer={orch} lens={lens} variant="compact" onClick={onPick} /></div></div>
        <HConnector flow={orch.flow} status={orch.lens[lens].status} show={conn} anim={anim} />
        <div className="flow-col"><div className="flow-card"><LayerCard layer={agent} lens={lens} variant="compact" onClick={onPick} /></div></div>
        <HConnector flow={agent.flow} status={agent.lens[lens].status} show={conn} anim={anim} />
        <div className="flow-col"><div className="flow-split">
          <LayerCard layer={tools} lens={lens} variant="compact" onClick={onPick} />
          <LayerCard layer={llm} lens={lens} variant="compact" onClick={onPick} />
        </div></div>
      </div>
    </div>
  );
}

/* ── Graph view (agent-centric hub) ────────────────────────── */
function GraphView({ lens, conn, anim, onPick }) {
  const byId = useMemo(() => Object.fromEntries(LAYERS.map((l) => [l.id, l])), []);
  // positions in % of a 980x520 stage
  const pos = {
    client: { x: 9, y: 26 }, gateway: { x: 9, y: 74 },
    orchestrator: { x: 36, y: 50 }, agent: { x: 62, y: 50 },
    tools: { x: 88, y: 24 }, llm: { x: 88, y: 76 },
  };
  const edges = [
    ["client", "orchestrator"], ["gateway", "orchestrator"],
    ["orchestrator", "agent"], ["agent", "tools"], ["agent", "llm"],
    ["orchestrator", "agent"],
  ];
  const H = 520;
  return (
    <div className="graph-wrap" style={{ height: H }}>
      <svg className="conn-svg" viewBox="0 0 980 520" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        {edges.map(([a, b], i) => {
          const pa = pos[a], pb = pos[b];
          const x1 = (pa.x / 100) * 980, y1 = (pa.y / 100) * 520;
          const x2 = (pb.x / 100) * 980, y2 = (pb.y / 100) * 520;
          const src = byId[a].lens[lens].status;
          const w = 2 + byId[a].flow * 6;
          return (
            <g key={i} style={{ "--flow-color": STATUS_VAR[src] || "var(--border-strong)" }}>
              <path className="graph-edge conn-line lit" d={`M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`} strokeWidth={w} vectorEffect="non-scaling-stroke" />
              {conn && <path className={"graph-edge conn-flow" + (anim ? " anim" : "")} d={`M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`} strokeWidth={Math.max(2, w - 2)} vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </svg>
      {LAYERS.map((l) => {
        const d = l.lens[lens];
        return (
          <div key={l.id} className="graph-node" data-status={d.status} style={{ left: pos[l.id].x + "%", top: pos[l.id].y + "%" }}
            role="button" tabIndex={0} onClick={() => onPick(l)} onKeyDown={(e) => { if (e.key === "Enter") onPick(l); }}>
            <div className="card-top" style={{ gap: 8 }}>
              <span className="dot" /><span className="card-name" style={{ fontSize: 13 }}>{l.name}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: d.status === "muted" ? "var(--text-faint)" : "var(--text)" }}>
              {d.headline}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{d.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Sparkline ─────────────────────────────────────────────── */
function Spark({ data, color }) {
  if (!data) return null;
  const w = 380, h = 56, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 4 - ((v - min) / (max - min || 1)) * (h - 10);
    return [x, y];
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${w} ${h} L0 ${h} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Drawer ────────────────────────────────────────────────── */
function Drawer({ layer, lens, onClose }) {
  const open = !!layer;
  const d = layer ? (layer.lens[lens] || layer.lens.overview) : null;
  const statusLabel = { critical: "Critical", good: "Healthy", warning: "Needs attention", muted: "No native telemetry" };
  const color = layer ? STATUS_VAR[d.status] : "var(--accent)";
  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <aside className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
        {layer && (
          <>
            <div className="drawer-head">
              <div>
                <div className="drawer-title">{layer.name}</div>
                <div className="drawer-status" style={{ color }}>● {statusLabel[d.status]}</div>
              </div>
              <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="drawer-body">
              {layer.otel === false ? (
                <>
                  <div className="empty-note">{layer.desc}</div>
                  <div className="dsection">
                    <div className="dsection-h">Why it matters</div>
                    <p style={{ margin: 0, color: "var(--text-subdued)", fontSize: 13.5 }}>
                      This tier emits no <code style={{ fontFamily: "var(--font-mono)" }}>gen_ai.*</code> spans, so it can't be measured directly. Propagate <code style={{ fontFamily: "var(--font-mono)" }}>session.id</code> and <code style={{ fontFamily: "var(--font-mono)" }}>gen_ai.user</code> from here so every downstream span can be attributed to a real user and request.
                    </p>
                  </div>
                  <div className="dsection">
                    <button className="drawer-cta" onClick={onClose}>{Ic.ext()} View instrumentation guide</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="metric-grid">
                    <div className="metric"><div className="metric-k">{layer.spansLabel}</div><div className="metric-v">{fmt(layer.spans)}</div></div>
                    <div className="metric"><div className="metric-k">{LENSES[lens === "overview" ? "cut-cost" : lens].unitLabel || "spend"}</div><div className="metric-v" style={{ color }}>{(layer.lens[lens === "overview" ? "cut-cost" : lens]).headline}</div></div>
                    <div className="metric"><div className="metric-k">p90 latency</div><div className="metric-v">{layer.lens["chase-latency"].headline}</div></div>
                    <div className="metric"><div className="metric-k">loop rate</div><div className="metric-v">{layer.lens["stop-a-loop"].headline}</div></div>
                  </div>
                  <div className="dsection">
                    <div className="dsection-h">Span volume · last 24h</div>
                    <Spark data={SPARK[layer.id]} color={color} />
                  </div>
                  <div className="dsection">
                    <div className="dsection-h">Top contributors</div>
                    <div className="contrib">
                      {layer.contributors.map((c) => (
                        <div className="contrib-row" key={c.name}>
                          <span className="contrib-name">{c.name}</span>
                          <span className="contrib-pct">{Math.round(c.value * 100)}%</span>
                          <span className="contrib-meta">{c.meta}</span>
                          <span className="contrib-bar"><span className="contrib-fill" style={{ width: c.value * 100 + "%", background: color }} /></span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {layer.drill && (
                    <div className="dsection">
                      <button className="drawer-cta" onClick={onClose}>{Ic.ext()} Open in {layer.drill}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/* ── Lens banner ───────────────────────────────────────────── */
function Banner({ lens }) {
  const b = LENSES[lens] && LENSES[lens].banner;
  if (!b) return null;
  return (
    <div className="banner" style={b.status === "warning" ? { background: "var(--warning-bg)", borderColor: "var(--warning-border)" } : {}}>
      <span className="banner-dot" style={{ background: STATUS_VAR[b.status] }} />
      <div className="banner-body">
        <div className="banner-head">{b.headline}</div>
        <div className="banner-detail">{b.detail}</div>
        <div className="banner-action">
          <button className="banner-cta">{Ic.bolt()} {b.action}</button>
          <span className="banner-savings">{b.savings}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Detail modal (pill / finding popup) ───────────────────── */
function DetailModal({ detail, onClose }) {
  const open = !!detail;
  const sev = { critical: "var(--critical)", warning: "var(--warning)", good: "var(--good)", info: "var(--core-title)", neutral: "var(--muted)" };
  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <div className={"modal" + (open ? " open" : "")} role="dialog" aria-modal="true">
        {detail && (
          <>
            <div className="modal-head">
              <span className="modal-sev" style={{ background: sev[detail.severity] || "var(--muted)" }} />
              <div>
                <div className="modal-title">{detail.title}</div>
                {detail.scope && <div className="modal-scope">{detail.scope}</div>}
              </div>
              <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              {detail.what && <p className="modal-what">{detail.what}</p>}
              {detail.why && (
                <div className="modal-block">
                  <div className="dsection-h">Why it matters</div>
                  <p className="modal-why">{detail.why}</p>
                </div>
              )}
              {detail.metrics && detail.metrics.length > 0 && (
                <div className="modal-metrics">
                  {detail.metrics.map((m, i) => (
                    <div className="metric" key={i}><div className="metric-k">{m.k}</div><div className="metric-v">{m.v}</div></div>
                  ))}
                </div>
              )}
              {(detail.action || detail.drill) && (
                <div className="modal-actions">
                  {detail.action && <button className="banner-cta">{Ic.bolt()} {detail.action}</button>}
                  {detail.drill && <button className="drawer-cta" onClick={onClose}>{Ic.ext()} Open in {detail.drill}</button>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ── Panel ─────────────────────────────────────────── */
function Panel({ t, lens, setLens, onPick, onOpenDetail }) {
  const conn = t.connectors;
  const anim = t.flowAnim && t.connectors;
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">AI Application Architecture</div>
          <div className="panel-sub">
            Fleet-wide
            <span className="sub-sep">·</span>
            <button className="sub-chip" onClick={() => onOpenDetail({ scope: "services" })}><b>{SCOPE.services}</b> services</button>
            <span className="sub-sep">·</span>
            <button className="sub-chip" onClick={() => onOpenDetail({ scope: "agents" })}><b>{SCOPE.agents}</b> agents</button>
            <span className="sub-sep">·</span>
            <button className="sub-chip" onClick={() => onOpenDetail({ scope: "tools" })}><b>{SCOPE.tools}</b> tools</button>
            <span className="sub-sep">·</span>
            <button className="sub-chip" onClick={() => onOpenDetail({ scope: "findings" })}><b>{SCOPE.findings}</b> active findings</button>
          </div>
        </div>
        <div className="panel-head-right">
          {t.live && (
            <div className="live-badge"><span className="live-dot" /><b>Live</b> · updated {SCOPE.refreshed}</div>
          )}
          <div className="lens-wrap">
            <span className="lens-label">Lens</span>
            <div className="lens-group">
              {["cut-cost", "chase-latency", "stop-a-loop"].map((id) => (
                <button key={id} className={"lens-pill" + (lens === id ? " active" : "")} onClick={() => setLens(lens === id ? "overview" : id)}>
                  {LENSES[id].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Banner lens={lens} />

      {t.layout === "map" && <window.MapView lens={lens} conn={conn} anim={anim} onPick={onPick} onOpenDetail={onOpenDetail} packets={t.packets} edgeRates={t.edgeRates} />}
      {t.layout === "layered" && <LayeredView lens={lens} conn={conn} anim={anim} onPick={onPick} />}
      {t.layout === "flow" && <FlowView lens={lens} conn={conn} anim={anim} onPick={onPick} />}

      <div className="map-legend">
        <span className="mleg"><span className="mleg-dots"><span className="mleg-dot" style={{ background: "var(--good)" }} /><span className="mleg-dot" style={{ background: "var(--warning)" }} /><span className="mleg-dot" style={{ background: "var(--critical)" }} /></span> health</span>
        <span className="mleg"><span className="mleg-dash" /> no native OTel</span>
        <span className="mleg"><span className="mleg-line" /> edge = call volume</span>
        <span className="mleg"><span className="edge-pill pill-sample" data-tone="warning">finding</span> cross-layer finding</span>
        <span className="mleg"><span className="mleg-find">N</span> findings on layer</span>
      </div>
      <div className="map-foot">Fleet KPI tiles and the token-consumption chart continue below the map · select any node or marker for detail.</div>
      <div className="map-scrolldown"><button aria-label="Scroll to KPI tiles" onClick={() => {
        const sc = document.querySelector(".scroll"), pr = document.querySelector(".pulse-rest");
        if (!sc || !pr) return;
        const start = sc.scrollTop;
        const target = start + (pr.getBoundingClientRect().top - sc.getBoundingClientRect().top) - 16;
        const t0 = performance.now(), dur = 460;
        const ease = (p) => 1 - Math.pow(1 - p, 3);
        const step = (now) => { const p = Math.min(1, (now - t0) / dur); sc.scrollTop = start + (target - start) * ease(p); if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }}>{Ic.chevDownThin()}</button></div>
    </div>
  );
}

/* ── App ───────────────────────────────────────────────────── */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "layout": "map",
  "density": "regular",
  "connectors": true,
  "flowAnim": true,
  "packets": true,
  "live": true,
  "edgeRates": true,
  "accent": "#1496ff"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lens, setLens] = useState("overview");
  const [picked, setPicked] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.dark ? "dark" : "light");
  }, [t.dark]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setPicked(null); setDetail(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accentStyle = { "--accent": t.accent };
  const openDetail = (spec) => setDetail(window.AIOBS.getDetail(spec));

  return (
    <DetailCtx.Provider value={openDetail}>
      <div className="app" data-density={t.density} style={accentStyle}>
        <Header tweaksOn={false} onTweaks={() => window.postMessage({ type: "__activate_edit_mode" }, "*")} />
        <Toolbar />
        <Context />
        <div className="scroll">
          <Panel t={t} lens={lens} setLens={setLens} onPick={setPicked} onOpenDetail={openDetail} />
          <window.PulseSections onOpenDetail={openDetail} />
        </div>

        <Drawer layer={picked} lens={lens} onClose={() => setPicked(null)} />
        <DetailModal detail={detail} onClose={() => setDetail(null)} />

        <TweaksPanel>
          <TweakSection label="Layout" />
          <TweakRadio label="Diagram" value={t.layout} options={["map", "layered", "flow"]} onChange={(v) => setTweak("layout", v)} />
          <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
          <TweakSection label="Flow" />
          <TweakToggle label="Flow connectors" value={t.connectors} onChange={(v) => setTweak("connectors", v)} />
          <TweakToggle label="Animate flow" value={t.flowAnim} onChange={(v) => setTweak("flowAnim", v)} />
          <TweakToggle label="Flowing packets" value={t.packets} onChange={(v) => setTweak("packets", v)} />
          <TweakSection label="Signals" />
          <TweakToggle label="Edge rate on hover" value={t.edgeRates} onChange={(v) => setTweak("edgeRates", v)} />
          <TweakToggle label="Live indicator" value={t.live} onChange={(v) => setTweak("live", v)} />
          <TweakSection label="Theme" />
          <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak("dark", v)} />
          <TweakColor label="Accent" value={t.accent} options={["#1496ff", "#474fcf", "#2a7453", "#9033a3"]} onChange={(v) => setTweak("accent", v)} />
        </TweaksPanel>
      </div>
    </DetailCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

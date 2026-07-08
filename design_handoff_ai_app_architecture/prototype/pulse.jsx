/* global React */
/* AI Application Architecture — Pulse page sections below the map.
   Attaches PulseSections to window. */
(function () {
  const { useMemo } = React;
  const { KPIS, MODELS, TOKENS, AGENTS_COST, FINDINGS, SPARK } = window.AIOBS;
  const SEV = { critical: "var(--critical)", warning: "var(--warning)", good: "var(--good)", info: "var(--core-title)", neutral: "var(--muted)" };

  function TileSpark({ id, tone }) {
    const data = SPARK[id];
    if (!data) return null;
    const w = 120, h = 30, max = Math.max(...data), min = Math.min(...data);
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const col = tone === "bad" ? "var(--critical)" : tone === "good" ? "var(--good)" : "var(--text-faint)";
    return (
      <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={line + ` L${w} ${h} L0 ${h} Z`} fill={col} opacity="0.1" />
        <path d={line} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }

  function KpiRow() {
    return (
      <div className="kpi-row">
        {KPIS.map((m) => (
          <div className="kpi" key={m.k}>
            <div className="kpi-k">{m.k}</div>
            <div className="kpi-v">{m.v}</div>
            <div className="kpi-foot">
              <span className="kpi-delta" data-tone={m.tone}>
                <span className="kpi-arrow">{m.dir === "up" ? "▲" : "▼"}</span>{m.delta}
              </span>
              {m.spark && <TileSpark id={m.spark} tone={m.tone} />}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function TokenChart() {
    const W = 1000, H = 210, pad = 6;
    const { layers, maxTotal } = useMemo(() => {
      const ls = MODELS.map(() => []);
      let mx = 0;
      TOKENS.forEach((tot) => {
        let cum = 0;
        MODELS.forEach((md, mi) => {
          const v = tot * md.share * (0.9 + ((mi * 7 + 3) % 5) * 0.05);
          ls[mi].push([cum, cum + v]);
          cum += v;
        });
        if (cum > mx) mx = cum;
      });
      return { layers: ls, maxTotal: mx };
    }, []);
    const x = (i) => (i / (TOKENS.length - 1)) * W;
    const y = (v) => H - pad - (v / maxTotal) * (H - pad * 2);
    return (
      <div className="panel sub-panel">
        <div className="sub-head">
          <div>
            <div className="sub-title">Token consumption</div>
            <div className="sub-sub">Input + output tokens by model · last 24h</div>
          </div>
          <div className="sub-right">
            <div className="sub-total">1.42B tokens</div>
            <div className="sub-total-sub">$26.6K spend</div>
          </div>
        </div>
        <div className="chart-wrap">
          <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} className="chart-grid" x1="0" x2={W} y1={H - pad - g * (H - pad * 2)} y2={H - pad - g * (H - pad * 2)} />
            ))}
            {layers.map((layer, mi) => {
              const top = layer.map((seg, i) => [x(i), y(seg[1])]);
              const bot = layer.map((seg, i) => [x(i), y(seg[0])]).reverse();
              const d = "M" + top.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") +
                " L" + bot.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + " Z";
              return <path key={mi} d={d} fill={MODELS[mi].color} opacity={mi === 0 ? 0.85 : mi === 1 ? 0.7 : 0.5} />;
            })}
          </svg>
        </div>
        <div className="chart-legend">
          {MODELS.map((md) => (
            <span className="cleg" key={md.name}><span className="cleg-sw" style={{ background: md.color }} /><span className="cleg-name">{md.name}</span><span className="cleg-pct">{Math.round(md.share * 100)}%</span></span>
          ))}
        </div>
      </div>
    );
  }

  function TopAgents() {
    return (
      <div className="panel sub-panel">
        <div className="sub-head"><div><div className="sub-title">Top agents by cost</div><div className="sub-sub">Window spend · 19 agents</div></div></div>
        <div className="bar-list">
          {AGENTS_COST.map((a) => (
            <div className="bar-row" key={a.name}>
              <span className="bar-name">{a.name}</span>
              <span className="bar-cost">{a.cost}</span>
              <span className="bar-meta">{a.model}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: a.pct * 100 + "%" }} /></span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function FindingsList({ onOpenDetail }) {
    return (
      <div className="panel sub-panel">
        <div className="sub-head"><div><div className="sub-title">Active findings</div><div className="sub-sub">{FINDINGS.length} open · select for detail</div></div></div>
        <div className="find-list">
          {FINDINGS.map((f, i) => (
            <button className="find-row" key={i} onClick={() => onOpenDetail(f.spec)}>
              <span className="find-dot" style={{ background: SEV[f.severity] }} />
              <span className="find-main">
                <span className="find-title">{f.title}</span>
                <span className="find-scope">{f.scope}</span>
              </span>
              <span className="find-metric" data-sev={f.severity}>{f.metric}</span>
              <span className="find-chev" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function PulseSections({ onOpenDetail }) {
    return (
      <div className="pulse-rest">
        <KpiRow />
        <TokenChart />
        <div className="pulse-two">
          <TopAgents />
          <FindingsList onOpenDetail={onOpenDetail} />
        </div>
      </div>
    );
  }

  window.PulseSections = PulseSections;
})();

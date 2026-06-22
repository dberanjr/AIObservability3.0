/* global React */
/* AI Application Architecture — node-map view. Attaches MapView to window. */
(function () {
  const { useRef, useState, useLayoutEffect, useEffect, useCallback, useMemo } = React;
  const { NODES, EDGES, LOOP, LENS_SPOTLIGHT, byId } = window.AIOBS;
  const STATUS_COLOR = { critical: "var(--critical)", good: "var(--good)", warning: "var(--warning)", muted: "var(--muted)" };
  const REDUCED = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── tier icons (Strato-style line icons) ─────────────────── */
  const I = (paths) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
  );
  const ICONS = {
    client: I(<g><rect x="2.5" y="4" width="19" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></g>),
    gateway: I(<path d="M12 2.5l7.5 3v5c0 4.4-3.1 7.6-7.5 9-4.4-1.4-7.5-4.6-7.5-9v-5z" />),
    orchestrator: I(<g><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M8 7l8 4M8 17l8-4" /></g>),
    agent: I(<g><rect x="4.5" y="7.5" width="15" height="11" rx="2.5" /><path d="M12 4.5v3M9 12.5h.01M15 12.5h.01M9.5 15.5h5" /><path d="M2.5 11v3M21.5 11v3" /></g>),
    tools: I(<path d="M14.5 6a3.5 3.5 0 0 0-4.9 4.4l-6 6 2 2 6-6A3.5 3.5 0 0 0 18 9l-2.3 2.3-1.4-1.4L16.6 7.6z" />),
    llm: I(<g><path d="M12 3l1.6 4.2L18 8.8l-3.4 2.4L15.4 16 12 13.4 8.6 16l.8-4.8L6 8.8l4.4-1.6z" /><path d="M19 16l.7 1.8L21.5 18l-1.4.9.3 1.8-1.4-1-1.4 1 .3-1.8-1.4-.9 1.8-.2z" /></g>),
    vector: I(<g><ellipse cx="12" cy="5.5" rx="7" ry="2.8" /><path d="M5 5.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6M5 11.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" /></g>),
    memory: I(<g><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M8 4v16M8 8h12M8 14h12" /></g>),
  };

  /* ── count-up number ──────────────────────────────────────── */
  function parseNum(value) {
    const m = /^(\D*?)([\d][\d,]*(?:\.\d+)?)(.*)$/.exec(value || "");
    if (!m) return null;
    const grouped = m[2].indexOf(",") >= 0;
    const decimals = m[2].indexOf(".") >= 0 ? m[2].split(".")[1].length : 0;
    return { prefix: m[1], num: parseFloat(m[2].replace(/,/g, "")), suffix: m[3], grouped, decimals };
  }
  function fmtNum(cur, p) {
    let n = p.decimals > 0 ? cur.toFixed(p.decimals) : String(Math.round(cur));
    if (p.grouped) n = Number(p.decimals > 0 ? cur.toFixed(p.decimals) : Math.round(cur)).toLocaleString("en-US");
    return p.prefix + n + p.suffix;
  }
  function CountUp({ value }) {
    const [disp, setDisp] = useState(value);
    useEffect(() => {
      const p = parseNum(value);
      if (!p || REDUCED) { setDisp(value); return; }
      let raf; const t0 = performance.now(), dur = 720;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        setDisp(fmtNum(p.num * e, p));
        if (k < 1) raf = requestAnimationFrame(tick); else setDisp(value);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [value]);
    return disp;
  }

  function MiniSpark({ data, status }) {
    if (!data) return null;
    const w = 104, h = 30, max = Math.max(...data), min = Math.min(...data);
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return (
      <svg className="mini-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path d={line} fill="none" stroke={STATUS_COLOR[status]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }

  function MapNode({ node, lens, idx, refCb, onPick, onOpenDetail, onHover, dim, entered }) {
    const d = node.lens[lens] || node.lens.overview;
    const isData = node.instrumented && d.headline !== undefined;
    return (
      <div
        ref={(el) => refCb(node.id, el)}
        className="mnode"
        data-cat={node.category}
        data-status={d.status}
        data-inst={node.instrumented ? "true" : "false"}
        data-tint={node.tint || ""}
        data-dim={dim ? "true" : "false"}
        style={{ "--enter-delay": idx * 42 + "ms" }}
        role="button" tabIndex={0}
        onClick={() => onPick(node)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(node); } }}
      >
        {node.findings > 0 && <span className="mnode-find" data-tone={node.findingTone}>{node.findings}</span>}
        <div className="mnode-head">
          <span className="mnode-icon">{ICONS[node.id]}<span className="mnode-dot" /></span>
          <span className="mnode-title">{node.name}</span>
          {node.enrich && (
            <button className="mnode-enrich" onClick={(e) => { e.stopPropagation(); onOpenDetail({ enrich: node.id }); }}>{node.enrich}</button>
          )}
          {isData && <span className="mnode-spark"><MiniSpark data={node.mini} status={d.status} /></span>}
        </div>
        {isData ? (
          <>
            <div className="mnode-metric">
              <span className="mnode-num"><CountUp value={d.headline} /></span>
              <span className="mnode-unit">{d.sub}</span>
            </div>
            {d.badges && d.badges.length > 0 && (
              <div className="mnode-badges">
                {d.badges.map((bd, i) => (
                  <button key={i} className="mbadge" data-tone={bd.tone}
                    onClick={(e) => { e.stopPropagation(); onOpenDetail({ badge: bd, node: node.name, drill: node.drill }); }}>{bd.t}</button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mnode-sub">{d.sub}</div>
        )}
      </div>
    );
  }

  function Arrow({ x, y, dirX, dirY, cls, size }) {
    const len = Math.hypot(dirX, dirY) || 1;
    const s = size || 7;
    const ux = dirX / len, uy = dirY / len, px = -uy, py = ux;
    const bx = x - ux * s * 1.6, by = y - uy * s * 1.6;
    return <polygon className={cls} points={`${x},${y} ${bx + px * s},${by + py * s} ${bx - px * s},${by - py * s}`} />;
  }

  function MapView({ lens, conn, anim, onPick, onOpenDetail, packets, edgeRates }) {
    const wrapRef = useRef(null);
    const nodeEls = useRef({});
    const [geo, setGeo] = useState(null);
    const [hoverNode, setHoverNode] = useState(null);
    const [hoverEdge, setHoverEdge] = useState(null);
    const [entered, setEntered] = useState(REDUCED);

    const setNodeRef = useCallback((id, el) => { if (el) nodeEls.current[id] = el; }, []);

    const measure = useCallback(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wr = wrap.getBoundingClientRect();
      const r = {};
      for (const n of NODES) {
        const el = nodeEls.current[n.id];
        if (!el) return;
        const b = el.getBoundingClientRect();
        r[n.id] = { x: b.left - wr.left, y: b.top - wr.top, w: b.width, h: b.height };
      }
      setGeo({ rects: r, W: wr.width, H: wr.height });
    }, []);

    useLayoutEffect(() => {
      let raf1 = 0, raf2 = 0, t1 = 0;
      measure();
      raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(measure); });
      t1 = setTimeout(measure, 140);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});
      const ro = new ResizeObserver(measure);
      if (wrapRef.current) ro.observe(wrapRef.current);
      window.addEventListener("resize", measure);
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(t1); ro.disconnect(); window.removeEventListener("resize", measure); };
    }, [measure, lens, conn]);

    // entrance reveal — JS-toggled (CSS transitions degrade to instant-visible
    // if the runtime doesn't play them, so content is never stuck hidden)
    useEffect(() => {
      if (entered) return;
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(r);
    }, []);

    const focus = useMemo(() => {
      if (hoverEdge) {
        const key = hoverEdge.key;
        if (key === "loop") return { active: true, nodes: new Set([LOOP.from, LOOP.to]), edges: new Set(["loop"]) };
        const [f, t] = key.split("-");
        return { active: true, nodes: new Set([f, t]), edges: new Set([key]) };
      }
      if (hoverNode) {
        const ns = new Set([hoverNode]), es = new Set();
        EDGES.forEach((e) => { if (e.from === hoverNode || e.to === hoverNode) { ns.add(e.from); ns.add(e.to); es.add(e.from + "-" + e.to); } });
        if (LOOP.from === hoverNode || LOOP.to === hoverNode) { ns.add(LOOP.from); ns.add(LOOP.to); es.add("loop"); }
        return { active: true, nodes: ns, edges: es };
      }
      if (lens !== "overview" && LENS_SPOTLIGHT[lens]) {
        const sp = LENS_SPOTLIGHT[lens];
        const es = new Set(sp.edges); if (sp.loop) es.add("loop");
        return { active: true, nodes: new Set(sp.nodes), edges: es };
      }
      return { active: false };
    }, [hoverNode, hoverEdge, lens]);

    const nodeDim = (id) => focus.active && !focus.nodes.has(id);
    const edgeState = (key) => (!focus.active ? "normal" : focus.edges.has(key) ? "lit" : "dim");

    function packetDots(dPath, w, state, loop) {
      if (!packets) return null;
      const n = loop ? 2 : Math.max(1, Math.round(w * 3));
      const dur = (loop ? 6 : 2.6) / (0.4 + w);
      const op = state === "dim" ? 0.1 : 0.95;
      return Array.from({ length: n }).map((_, k) => (
        <span key={k} className={"pkt" + (loop ? " pkt-loop" : "") + (anim || true ? "" : "")}
          style={{ offsetPath: `path("${dPath}")`, animationDuration: dur + "s", animationDelay: (-(dur / n) * k) + "s", opacity: op }} />
      ));
    }

    function buildEdges() {
      if (!geo) return null;
      const R = geo.rects, out = [];
      EDGES.forEach((e, i) => {
        const a = R[e.from], b2 = R[e.to];
        if (!a || !b2) return;
        const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b2.x + b2.w / 2, y2 = b2.y;
        const dy = Math.max(24, (y2 - y1) * 0.5);
        const dPath = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
        const wpx = 2.5 + e.w * 17, key = e.from + "-" + e.to, st = edgeState(key);
        out.push(
          <g key={"e" + i} className={"medge-g " + st}>
            <path className="medge" d={dPath} strokeWidth={wpx} pathLength="1" />
            {conn && <path className={"medge-flow" + (anim ? " anim" : "")} d={dPath} strokeWidth={Math.max(2, wpx - 2)} />}
            <Arrow x={x2} y={y2} dirX={x2 - x1} dirY={dy} cls="medge-arrow" />
            <path className="medge-hit" d={dPath}
              onMouseEnter={() => setHoverEdge({ key, x: (x1 + x2) / 2, y: (y1 + y2) / 2, rate: e.rate })}
              onMouseLeave={() => setHoverEdge(null)} />
          </g>
        );
        if (packets) out.push(<div key={"pk" + i} className="pkt-layer" data-state={st}>{packetDots(dPath, e.w, st)}</div>);
        if (e.finding) {
          out.push(
            <button key={"fp" + i} className="edge-pill" data-tone={e.tone || "warning"} data-dim={st === "dim" ? "true" : "false"}
              style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}
              onClick={() => onOpenDetail({ finding: e.fid })}>{e.flabel}</button>
          );
        }
      });
      // loop edge
      const a = R[LOOP.from], b2 = R[LOOP.to];
      if (a && b2) {
        const sx = a.x + a.w, sy = a.y + a.h * 0.4, ex = b2.x + b2.w, ey = b2.y + b2.h * 0.5;
        const bulge = Math.min(geo.W - 14, Math.max(sx, ex) + 130);
        const dPath = `M ${sx} ${sy} C ${bulge} ${sy}, ${bulge} ${ey + 30}, ${ex} ${ey}`;
        const st = edgeState("loop"), midY = (sy + ey) / 2;
        out.push(
          <g key="loop" className={"medge-g loop-g " + st}>
            <path className="medge-loop-base" d={dPath} />
            {conn && <path className={"medge-loop-flow" + (anim ? " anim" : "")} d={dPath} />}
            <Arrow x={ex} y={ey} dirX={ex - bulge} dirY={ey - (ey + 30)} cls="loop-arrow" size={9} />
            <path className="medge-hit" d={dPath}
              onMouseEnter={() => setHoverEdge({ key: "loop", x: bulge - 4, y: midY, rate: LOOP.rate })}
              onMouseLeave={() => setHoverEdge(null)} />
          </g>
        );
        if (packets) out.push(<div key="pkloop" className="pkt-layer" data-state={st}>{packetDots(dPath, 0.5, st, true)}</div>);
        out.push(
          <button key="loop-pill" className="loop-pill" data-dim={st === "dim" ? "true" : "false"} style={{ left: bulge - 4, top: midY }}
            onClick={() => onOpenDetail({ loop: true })}>{LOOP.label}</button>
        );
      }
      return out;
    }

    const edgeNodes = buildEdges();

    return (
      <div className="map-stage" ref={wrapRef} data-focus={focus.active ? "true" : "false"}>
        <svg className="map-edges" width={geo ? geo.W : "100%"} height={geo ? geo.H : "100%"}>
          {edgeNodes && edgeNodes.filter((n) => n && n.type === "g")}
        </svg>
        {edgeNodes && edgeNodes.filter((n) => n && n.type !== "g")}

        {edgeRates && hoverEdge && (
          <div className="edge-rate" style={{ left: hoverEdge.x, top: hoverEdge.y }}>{hoverEdge.rate}</div>
        )}

        <div className="map-grid">
          <div className="map-row"><MapNode node={byId.client} lens={lens} idx={0} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("client")} /></div>
          <div className="map-row"><MapNode node={byId.gateway} lens={lens} idx={1} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("gateway")} /></div>
          <div className="map-row"><MapNode node={byId.orchestrator} lens={lens} idx={2} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("orchestrator")} /></div>
          <div className="map-row"><MapNode node={byId.agent} lens={lens} idx={3} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("agent")} /></div>
          <div className="map-leaves">
            <MapNode node={byId.tools} lens={lens} idx={4} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("tools")} />
            <MapNode node={byId.llm} lens={lens} idx={5} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("llm")} />
            <MapNode node={byId.vector} lens={lens} idx={6} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("vector")} />
            <MapNode node={byId.memory} lens={lens} idx={7} entered={entered} refCb={setNodeRef} onPick={onPick} onOpenDetail={onOpenDetail} onHover={setHoverNode} dim={nodeDim("memory")} />
          </div>
        </div>
      </div>
    );
  }

  window.MapView = MapView;
})();

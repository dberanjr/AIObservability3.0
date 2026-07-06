/**
 * Self-contained stylesheet for the node-map. Injected once (see NodeMap) under
 * `<style data-aiobs-archmap>`. Every class is `am-` prefixed and scoped under
 * `.am-root` so nothing leaks into the rest of the app.
 *
 * Motion rule (project decision): informational content — nodes, edges, numbers
 * — is always visible at rest. Only decorative motion (flowing packets, dash
 * drift, the live ping) runs, and only under prefers-reduced-motion: no-preference.
 * Count-up degrades to the final value (handled in JS).
 */
export const ARCH_MAP_CSS = `
.am-root { position: relative; }

/* ── header ─────────────────────────────────────────────── */
.am-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.am-title { font-size: 14px; font-weight: 600; color: var(--text); margin: 0; }
.am-sub { margin-top: 6px; font-size: 11.5px; color: var(--text-3); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.am-chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; }
.am-chip b { color: var(--text); font-weight: 700; }
.am-chip:hover { border-color: var(--text-4); color: var(--text); background: var(--surface-3); }
.am-chip:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
.am-chip-lead { font-weight: 700; color: var(--text); background: color-mix(in oklab, var(--blue) 12%, transparent); border-color: color-mix(in oklab, var(--blue) 30%, var(--border)); cursor: default; }
.am-chip-lead:hover { background: color-mix(in oklab, var(--blue) 12%, transparent); color: var(--text); border-color: color-mix(in oklab, var(--blue) 30%, var(--border)); }

.am-head-right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.am-live { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-2); }
.am-live b { color: var(--text); font-weight: 600; }
.am-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--am-muted); position: relative; }
.am-live[data-state="fresh"] .am-live-dot { background: var(--am-health); }
.am-live[data-state="stale"] .am-live-dot { background: var(--am-warning); }
.am-live[data-state="pending"] .am-live-dot { background: var(--am-muted); }
.am-lens-label { font-size: 11px; color: var(--text-3); }
.am-lens-group { display: inline-flex; gap: 4px; }
.am-lens-pill { all: unset; cursor: pointer; font-size: 11.5px; color: var(--text-2); padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-2); }
.am-lens-pill:hover { border-color: var(--text-4); color: var(--text); }
.am-lens-pill.active { background: var(--blue); border-color: var(--blue); color: #fff; font-weight: 600; }
.am-lens-pill:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }

/* ── lens banner ────────────────────────────────────────── */
.am-banner { display: flex; gap: 12px; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); }
.am-banner[data-status="critical"] { border-color: color-mix(in oklab, var(--red) 40%, var(--border)); background: color-mix(in oklab, var(--red) 7%, var(--surface)); }
.am-banner[data-status="warning"] { border-color: color-mix(in oklab, var(--amber) 40%, var(--border)); background: color-mix(in oklab, var(--amber) 7%, var(--surface)); }
.am-banner[data-status="info"] { border-color: color-mix(in oklab, #474fcf 40%, var(--border)); background: color-mix(in oklab, #474fcf 6%, var(--surface)); }
.am-banner-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 3px; flex: 0 0 auto; }
.am-banner-headbtn { all: unset; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); }
.am-banner-headbtn:hover { text-decoration: underline; }
.am-banner-headbtn:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 3px; }
.am-banner-more { font-size: 11.5px; color: var(--text-3); }
.am-banner-body { display: flex; flex-direction: column; gap: 4px; }
.am-banner-head { font-size: 13px; font-weight: 600; color: var(--text); }
.am-banner-detail { font-size: 12px; color: var(--text-2); line-height: 1.45; }
.am-banner-action { display: flex; align-items: center; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
.am-banner-cta { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: #fff; background: var(--blue); padding: 5px 10px; border-radius: 6px; }
.am-banner-cta:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.am-banner-savings { font-size: 11.5px; font-weight: 600; color: var(--am-health); }

/* ── at-rest health verdict ─────────────────────────────── */
.am-verdict { all: unset; cursor: pointer; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 13px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); }
.am-verdict:hover { border-color: var(--text-4); }
.am-verdict:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.am-verdict[data-status="warning"] { border-color: color-mix(in oklab, var(--amber) 40%, var(--border)); background: color-mix(in oklab, var(--amber) 6%, var(--surface)); }
.am-verdict[data-status="critical"] { border-color: color-mix(in oklab, var(--red) 40%, var(--border)); background: color-mix(in oklab, var(--red) 6%, var(--surface)); }
.am-verdict-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.am-verdict-text { font-size: 12.5px; color: var(--text-2); flex: 1 1 auto; min-width: 0; }
.am-verdict-text b { color: var(--text); font-weight: 700; }
.am-verdict-sub { color: var(--text-3); }
.am-verdict-cta { font-size: 11.5px; font-weight: 600; color: var(--blue); flex: 0 0 auto; }

/* ── stage / grid ───────────────────────────────────────── */
.am-stage { position: relative; padding: 4px 2px; }
.am-edges { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 0; }
.am-grid { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 30px; }
.am-row { display: flex; justify-content: center; width: 100%; }
.am-leaves-grid { display: grid; grid-template-columns: repeat(2, 230px); gap: 30px 16px; justify-content: center; width: 100%; }

/* ── node card ──────────────────────────────────────────── */
.am-node {
  position: relative; box-sizing: border-box; width: 260px; max-width: 100%;
  background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--am-muted);
  border-radius: 10px; padding: 11px 13px 12px; box-shadow: var(--shadow);
  cursor: pointer; transition: opacity .25s ease, transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.am-leaves-grid .am-node { width: 230px; }
.am-node:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.am-node:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.am-node[data-cat="core"] { border-top-color: var(--am-core); }
.am-node[data-cat="resource"] { border-top-color: var(--am-resource); }
.am-node[data-state="none"] { border-top-style: dashed; background: var(--surface-2); }
.am-node[data-state="inferred"] { border-style: dashed; border-top-style: dashed; }
.am-node[data-state="ghost"] { border-style: dashed; background: transparent; box-shadow: none; opacity: .6; }
.am-node[data-state="ghost"]:hover { opacity: .85; transform: none; box-shadow: none; }
.am-node[data-dim="true"] { opacity: .32; }
.am-node[data-dim="true"]:hover { opacity: .6; }

/* Redundant (non-colour-only) status cue: a left accent bar on non-healthy
   tiers, kept separate from the category accent on the top border. */
.am-node::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 2px; background: transparent; pointer-events: none; }
.am-node[data-status="warning"]::before { background: var(--am-warning); }
.am-node[data-status="critical"]::before { background: var(--am-critical); }

.am-node-find { position: absolute; top: -8px; right: -8px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 10.5px; font-weight: 700; color: #fff; display: grid; place-items: center; background: var(--am-warning); box-shadow: var(--shadow); }
.am-node-find[data-tone="critical"] { background: var(--am-critical); }
.am-node-find[data-tone="warning"] { background: var(--am-warning); }
.am-node-find[data-tone="neutral"] { background: var(--text-3); }

.am-node-head { display: flex; align-items: center; gap: 8px; }
.am-node-icon { position: relative; display: inline-flex; color: var(--am-muted); flex: 0 0 auto; }
.am-node[data-cat="core"] .am-node-icon { color: var(--am-core); }
.am-node[data-cat="resource"] .am-node-icon { color: var(--am-resource); }
.am-node-dot { position: absolute; right: -3px; bottom: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--am-muted); border: 1.5px solid var(--surface); }
.am-node[data-status="healthy"] .am-node-dot { background: var(--am-health); }
.am-node[data-status="warning"] .am-node-dot { background: var(--am-warning); }
.am-node[data-status="critical"] .am-node-dot { background: var(--am-critical); }
.am-node-title { font-size: 12.5px; font-weight: 600; color: var(--text); flex: 1 1 auto; }
.am-node-spark { display: inline-flex; align-items: center; margin-left: auto; flex: 0 0 auto; opacity: .85; }
.am-node-enrich { all: unset; cursor: pointer; font-size: 10px; color: var(--blue); background: color-mix(in oklab, var(--blue) 12%, transparent); padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
.am-node-enrich:hover { background: color-mix(in oklab, var(--blue) 22%, transparent); }
.am-node-enrich:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }

.am-node-metric { display: flex; align-items: baseline; gap: 6px; margin-top: 8px; }
.am-node-num { font-size: 22px; font-weight: 700; line-height: 1; color: var(--text); font-variant-numeric: tabular-nums; }
.am-node[data-status="critical"] .am-node-num { color: var(--am-critical); }
.am-node[data-status="warning"] .am-node-num { color: var(--am-warning); }
.am-node-unit { font-size: 11px; color: var(--text-3); }
.am-node-status { margin-left: auto; display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; line-height: 1; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
.am-node-status[data-status="warning"] { color: var(--am-warning); background: color-mix(in oklab, var(--amber) 14%, transparent); }
.am-node-status[data-status="critical"] { color: #fff; background: var(--am-critical); }
.am-node-sub { margin-top: 7px; font-size: 11px; color: var(--text-3); line-height: 1.4; }

/* ── framework row (orchestrator tier, split per framework) ─ */
.am-fw-row { display: flex; flex-wrap: wrap; justify-content: center; align-items: stretch; gap: 12px; width: 100%; }
.am-fw-node {
  position: relative; box-sizing: border-box; flex: 0 1 150px; min-width: 132px; max-width: 180px;
  background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--am-core);
  border-radius: 10px; padding: 9px 11px 10px; box-shadow: var(--shadow);
  cursor: pointer; transition: opacity .25s ease, transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.am-fw-node:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.am-fw-node:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.am-fw-node[data-dim="true"] { opacity: .32; }
.am-fw-node[data-dim="true"]:hover { opacity: .6; }
.am-fw-node.am-fw-muted { border-top-color: var(--am-muted); border-style: dashed; opacity: .75; }

.am-fw-head { display: flex; align-items: center; gap: 7px; }
.am-fw-icon { position: relative; display: inline-flex; color: var(--am-core); flex: 0 0 auto; }
.am-fw-dot { position: absolute; right: -3px; bottom: -3px; width: 7px; height: 7px; border-radius: 50%; background: var(--am-muted); border: 1.5px solid var(--surface); }
.am-fw-node[data-status="healthy"] .am-fw-dot { background: var(--am-health); }
.am-fw-node[data-status="warning"] .am-fw-dot { background: var(--am-warning); }
.am-fw-node[data-status="critical"] .am-fw-dot { background: var(--am-critical); }
.am-fw-title { font-size: 12px; font-weight: 600; color: var(--text); flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.am-fw-metric { display: flex; align-items: baseline; gap: 5px; margin-top: 7px; }
.am-fw-num { font-size: 19px; font-weight: 700; line-height: 1; color: var(--text); font-variant-numeric: tabular-nums; }
.am-fw-node[data-status="critical"] .am-fw-num { color: var(--am-critical); }
.am-fw-node[data-status="warning"] .am-fw-num { color: var(--am-warning); }
.am-fw-unit { font-size: 10px; color: var(--text-3); }
.am-fw-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
.am-fw-sub { margin-top: 7px; font-size: 11px; color: var(--text-3); line-height: 1.4; }

/* loading shimmer (gradual paint while the summarize is pending) */
.am-node-shimmer { display: flex; flex-direction: column; gap: 7px; margin-top: 9px; }
.am-shimmer-bar { display: block; border-radius: 5px; background: var(--surface-3); }
.am-shimmer-num { height: 18px; width: 60%; }
.am-shimmer-sub { height: 9px; width: 40%; }
@media (prefers-reduced-motion: no-preference) {
  .am-shimmer-bar { background: linear-gradient(90deg, var(--surface-3) 25%, var(--surface-2) 50%, var(--surface-3) 75%); background-size: 200% 100%; animation: am-shimmer 1.3s ease-in-out infinite; }
}
@keyframes am-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.am-node-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.am-badge { all: unset; cursor: pointer; font-size: 10px; font-weight: 600; color: var(--text-2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
.am-badge:hover { border-color: var(--text-4); color: var(--text); }
.am-badge:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
.am-badge[data-tone="critical"] { color: var(--am-critical); border-color: color-mix(in oklab, var(--red) 45%, var(--border)); background: color-mix(in oklab, var(--red) 8%, transparent); }
.am-badge[data-tone="warning"] { color: var(--am-warning); border-color: color-mix(in oklab, var(--amber) 45%, var(--border)); background: color-mix(in oklab, var(--amber) 8%, transparent); }
.am-badge[data-tone="cost"] { color: var(--am-core); border-color: color-mix(in oklab, var(--am-core) 45%, var(--border)); background: color-mix(in oklab, var(--am-core) 8%, transparent); }

.am-mini { display: block; }
.am-spark-wrap { position: relative; display: inline-block; overflow: visible; cursor: crosshair; }
.am-spark-guide { position: absolute; top: 0; bottom: 0; width: 1px; transform: translateX(-0.5px); background: var(--text-4); opacity: .5; pointer-events: none; }
.am-spark-dot { position: absolute; width: 7px; height: 7px; border-radius: 50%; transform: translate(-50%, -50%); border: 1.5px solid var(--surface); box-shadow: var(--shadow); pointer-events: none; }
.am-spark-val { position: absolute; transform: translate(-50%, -150%); white-space: nowrap; font-size: 10px; font-weight: 700; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; box-shadow: var(--shadow); pointer-events: none; z-index: 4; font-variant-numeric: tabular-nums; }
/* Static latest-value end-label (Pulse-7) — anchored left of the end point so it
   stays inside the card; lighter than the hover readout. */
.am-spark-dot-end { opacity: .9; }
.am-spark-val-end { transform: translate(-100%, -60%); font-size: 9px; padding: 0 3px; box-shadow: none; z-index: 3; background: color-mix(in oklab, var(--surface) 82%, transparent); border-color: color-mix(in oklab, var(--border) 70%, transparent); }

/* ── edges (svg) ────────────────────────────────────────── */
.am-edge { fill: none; stroke: var(--text-4); opacity: .45; stroke-linecap: round; }
.am-edge-flow { fill: none; stroke: var(--am-core); stroke-linecap: round; stroke-dasharray: 2 13; opacity: .9; }
.am-arrow { fill: var(--text-4); opacity: .6; }
.am-hit { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; }
.am-edge-g.dim .am-edge { opacity: .12; }
.am-edge-g.dim .am-edge-flow { opacity: .08; }
.am-edge-g.dim .am-arrow { opacity: .12; }
.am-edge-g.lit .am-edge { opacity: .7; }
.am-edge-g.lit .am-edge-flow { opacity: 1; stroke: var(--am-core); }
.am-edge-g.lit .am-arrow { opacity: .9; }

.am-loop-base { fill: none; stroke: var(--am-loop); opacity: .35; stroke-width: 2.5; }
.am-loop-flow { fill: none; stroke: var(--am-loop); stroke-width: 2.5; stroke-dasharray: 4 9; opacity: .95; }
.am-loop-arrow { fill: var(--am-loop); }
.am-loop-g.dim .am-loop-base, .am-loop-g.dim .am-loop-flow, .am-loop-g.dim .am-loop-arrow { opacity: .12; }

/* ── packets (decorative; motion-gated) ─────────────────── */
.am-pkt-layer { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.am-pkt-layer[data-state="dim"] { opacity: .12; }
.am-pkt { position: absolute; top: 0; left: 0; width: 5px; height: 5px; margin: -2.5px; border-radius: 50%; background: var(--am-core); offset-rotate: 0deg; opacity: 0; }
.am-pkt-loop { background: var(--am-loop); }
@media (prefers-reduced-motion: no-preference) {
  .am-pkt { opacity: .95; animation: am-travel linear infinite; }
  .am-edge-flow.anim { animation: am-dash 1.1s linear infinite; }
  .am-loop-flow.anim { animation: am-dash 1.6s linear infinite; }
  .am-live[data-state="fresh"] .am-live-dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--am-health); animation: am-ping 2s ease-out infinite; }
}
@keyframes am-travel { from { offset-distance: 0%; } to { offset-distance: 100%; } }
@keyframes am-dash { to { stroke-dashoffset: -30; } }
@keyframes am-ping { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(3); opacity: 0; } }

/* ── edge pills + rate tooltip ──────────────────────────── */
.am-edge-pill, .am-loop-pill { all: unset; position: absolute; transform: translate(-50%, -50%); z-index: 2; cursor: pointer; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; white-space: nowrap; box-shadow: var(--shadow); }
.am-edge-pill { color: #fff; background: var(--am-warning); }
.am-edge-pill[data-tone="critical"] { background: var(--am-critical); }
.am-loop-pill { color: #fff; background: var(--am-loop); }
.am-edge-pill[data-dim="true"], .am-loop-pill[data-dim="true"] { opacity: .2; }
.am-edge-pill:focus-visible, .am-loop-pill:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.am-edge-rate { position: absolute; transform: translate(-50%, -140%); z-index: 3; pointer-events: none; font-size: 10.5px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; box-shadow: var(--shadow); white-space: nowrap; }
/* Always-on volume label on the busiest edges (Pulse-7) — subtler than the
   hover readout so it reads as a resting annotation, not a tooltip. */
.am-edge-rate-static { position: absolute; transform: translate(-50%, -50%); z-index: 2; pointer-events: none; font-size: 9.5px; font-weight: 700; color: var(--text-2); background: color-mix(in oklab, var(--surface) 88%, transparent); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.am-edge-rate-static[data-dim="true"] { opacity: .18; }

/* ── legend + footer ────────────────────────────────────── */
.am-legend { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding-top: 4px; }
.am-leg { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--text-3); }
.am-leg-dots { display: inline-flex; gap: 3px; }
.am-leg-dot { width: 8px; height: 8px; border-radius: 50%; }
.am-leg-dash { width: 18px; height: 0; border-top: 2px dashed var(--text-4); }
.am-leg-line { width: 18px; height: 0; border-top: 3px solid var(--am-core); opacity: .7; }
.am-leg-line-thin { width: 12px; height: 0; border-top: 1px solid var(--am-core); opacity: .7; }
.am-leg-scale { display: inline-flex; align-items: center; gap: 3px; }
.am-leg-loop { width: 18px; height: 0; border-top: 2px dashed var(--am-loop); }
.am-leg-find { min-width: 16px; height: 16px; border-radius: 8px; background: var(--am-warning); color: #fff; font-size: 9.5px; font-weight: 700; display: grid; place-items: center; padding: 0 4px; }
.am-leg-pill { font-size: 9.5px; font-weight: 700; color: #fff; background: var(--am-warning); border-radius: 999px; padding: 1px 6px; }
.am-foot { font-size: 10.5px; color: var(--text-3); font-style: italic; text-align: center; padding-top: 2px; }

/* ── whole-map empty overlay (Pulse-11) ─────────────────── */
.am-map-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; background: color-mix(in oklab, var(--surface) 74%, transparent); border-radius: 10px; z-index: 5; }
.am-map-empty-card { max-width: 460px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); padding: 6px 14px; }

/* ── scrim / drawer / modal ─────────────────────────────── */
.am-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.32); opacity: 0; pointer-events: none; transition: opacity .2s ease; z-index: 40; }
.am-scrim.open { opacity: 1; pointer-events: auto; }
.am-drawer { position: fixed; top: 0; right: 0; height: 100%; width: 420px; max-width: 92vw; background: var(--surface); border-left: 1px solid var(--border); box-shadow: var(--shadow-lg); transform: translateX(100%); transition: transform .26s cubic-bezier(.4,0,.2,1); z-index: 41; display: flex; flex-direction: column; }
.am-drawer.open { transform: translateX(0); }
.am-drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.am-drawer-title { font-size: 15px; font-weight: 700; color: var(--text); }
.am-drawer-status { font-size: 12px; margin-top: 3px; }
.am-drawer-close { all: unset; cursor: pointer; font-size: 20px; line-height: 1; color: var(--text-3); padding: 2px 6px; border-radius: 6px; }
.am-drawer-close:hover { background: var(--surface-3); color: var(--text); }
.am-drawer-body { padding: 16px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.am-dsection { display: flex; flex-direction: column; gap: 8px; }
.am-dsection-h { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); }
.am-metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.am-metric { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
.am-metric-k { font-size: 10.5px; color: var(--text-3); }
.am-metric-v { font-size: 16px; font-weight: 700; color: var(--text); margin-top: 2px; font-variant-numeric: tabular-nums; }
.am-contrib { display: flex; flex-direction: column; gap: 8px; }
.am-contrib-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; }
.am-contrib-name { font-size: 12px; color: var(--text); font-weight: 600; }
.am-contrib-pct { font-size: 11.5px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.am-contrib-track { grid-column: 1 / -1; height: 5px; border-radius: 3px; background: var(--surface-3); overflow: hidden; }
.am-contrib-fill { display: block; height: 100%; border-radius: 3px; }
.am-empty-note { font-size: 13px; color: var(--text-2); line-height: 1.5; }
.am-cta { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; }
.am-cta:hover { border-color: var(--text-4); background: var(--surface-2); }
.am-cta:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.am-pattern { display: flex; flex-direction: column; gap: 2px; }
.am-pattern.is-disabled { opacity: .5; }
.am-pattern-tag { font-size: 9px; color: var(--text-3); border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; }
.am-pattern-drills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.am-drill { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--blue); border: 1px solid var(--border); border-radius: 5px; padding: 3px 8px; }
.am-drill:hover { border-color: var(--blue); background: var(--surface-2); }
.am-drill:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.am-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; background: var(--surface-3); padding: 0 4px; border-radius: 4px; }

.am-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -46%); width: 460px; max-width: 92vw; max-height: 86vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .18s ease; z-index: 42; }
.am-modal.open { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
.am-modal-head { display: flex; align-items: flex-start; gap: 10px; padding: 16px 18px 10px; }
.am-modal-sev { font-size: 13px; line-height: 1; margin-top: 3px; flex: 0 0 auto; }
.am-modal-title { font-size: 15px; font-weight: 700; color: var(--text); }
.am-modal-scope { font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
.am-modal-body { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 14px; }
.am-modal-what { margin: 0; font-size: 13px; color: var(--text); line-height: 1.5; }
.am-modal-why { margin: 0; font-size: 12.5px; color: var(--text-2); line-height: 1.5; }
.am-modal-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.am-modal-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
`;

/**
 * Count-up display for a metric headline. Parses the numeric core out of a
 * formatted string (e.g. "176.6K", "$18.9K", "63%", "144,053"), eases it from
 * 0 → target, and re-applies the original prefix/suffix/grouping so the unit
 * never disappears mid-animation.
 *
 * Motion rule: under prefers-reduced-motion (or when the value can't be parsed)
 * it renders the final value immediately — the number is always readable at rest.
 */
import React, { useEffect, useState } from "react";

const prefersReduced = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Parsed {
  prefix: string;
  num: number;
  suffix: string;
  grouped: boolean;
  decimals: number;
}

const parse = (value: string): Parsed | null => {
  const m = /^(\D*?)([\d][\d,]*(?:\.\d+)?)(.*)$/.exec(value ?? "");
  if (!m) return null;
  return {
    prefix: m[1],
    num: parseFloat(m[2].replace(/,/g, "")),
    suffix: m[3],
    grouped: m[2].includes(","),
    decimals: m[2].includes(".") ? m[2].split(".")[1].length : 0,
  };
};

const fmt = (cur: number, p: Parsed): string => {
  const rounded = p.decimals > 0 ? cur.toFixed(p.decimals) : String(Math.round(cur));
  const body = p.grouped
    ? Number(p.decimals > 0 ? cur.toFixed(p.decimals) : Math.round(cur)).toLocaleString("en-US")
    : rounded;
  return p.prefix + body + p.suffix;
};

export const CountUp = ({ value }: { value: string }) => {
  const [disp, setDisp] = useState(value);

  useEffect(() => {
    const p = parse(value);
    if (!p || prefersReduced()) {
      setDisp(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 720;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisp(fmt(p.num * eased, p));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setDisp(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{disp}</>;
};

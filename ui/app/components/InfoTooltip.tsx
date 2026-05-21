import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface InfoTooltipProps {
  /** Hover/focus text explaining what the surrounding metric / panel means. */
  text: string;
  /** Width of the visible icon (px). */
  size?: number;
}

const POPUP_W = 260;
const VIEWPORT_MARGIN = 8;
const GAP = 8;

/**
 * Hover-or-focus info icon (circled-i) with a styled popover that's portal'd
 * to <body> and viewport-clamped. The popup is positioned with `position:
 * fixed` against measured icon coordinates so it can't be clipped by any
 * overflow:hidden parent, and it slides horizontally / flips vertically to
 * stay inside the viewport when the icon is near an edge.
 */
export const InfoTooltip = ({ text, size = 14 }: InfoTooltipProps) => {
  const [open, setOpen] = useState(false);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Close on Esc when focused.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Re-measure on open + on scroll/resize while open so the popup tracks
  // the icon when the user scrolls without closing the tooltip.
  useLayoutEffect(() => {
    if (!open || !iconRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const icon = iconRef.current;
      if (!icon) return;
      const iconRect = icon.getBoundingClientRect();
      const popupH =
        popupRef.current?.getBoundingClientRect().height ??
        // Reasonable first-render guess so the popup lands close-enough on
        // the first frame; the next layout pass refines.
        100;

      // Center horizontally on the icon, then clamp to the viewport.
      let left = iconRect.left + iconRect.width / 2 - POPUP_W / 2;
      left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(window.innerWidth - POPUP_W - VIEWPORT_MARGIN, left),
      );

      // Prefer below; flip above if there isn't room.
      const spaceBelow = window.innerHeight - iconRect.bottom - VIEWPORT_MARGIN;
      const spaceAbove = iconRect.top - VIEWPORT_MARGIN;
      let top: number;
      if (spaceBelow >= popupH + GAP) {
        top = iconRect.bottom + GAP;
      } else if (spaceAbove >= popupH + GAP) {
        top = iconRect.top - popupH - GAP;
      } else {
        // Neither side fits cleanly — pin to whichever has more room.
        top =
          spaceBelow >= spaceAbove
            ? Math.min(iconRect.bottom + GAP, window.innerHeight - popupH - VIEWPORT_MARGIN)
            : Math.max(VIEWPORT_MARGIN, iconRect.top - popupH - GAP);
      }
      setPos({ left, top });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        ref={iconRef}
        role="img"
        aria-label={text}
        tabIndex={0}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: "50%",
          border: "1px solid var(--text-4)",
          color: "var(--text-3)",
          fontSize: Math.round(size * 0.65),
          fontWeight: 700,
          fontFamily: "serif",
          cursor: "help",
          lineHeight: 1,
          background: "var(--surface)",
          outline: "none",
        }}
      >
        i
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popupRef}
            role="tooltip"
            style={{
              position: "fixed",
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              width: POPUP_W,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 11.5,
              lineHeight: 1.4,
              color: "var(--text)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.14)",
              whiteSpace: "normal",
              pointerEvents: "none",
              fontWeight: 400,
              letterSpacing: 0,
              textTransform: "none",
              fontFamily: "inherit",
              zIndex: 1200,
              // Hide until measured so we don't flash an off-screen tooltip
              // for one frame.
              visibility: pos ? "visible" : "hidden",
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
};

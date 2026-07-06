import type React from "react";

/**
 * Keyboard navigation for `role="radiogroup"` segmented controls (Prompts-11).
 * Native radios move selection with the arrow keys and expose a single tab stop
 * (roving tabindex); the app's hand-rolled radiogroups did neither. `tabIndex`
 * on each radio should be `radioTabIndex(active)`, and the container's
 * `onKeyDown` should call `handleRadioGroupKeyDown`.
 */

/** Roving tab stop: only the active radio is tabbable. */
export const radioTabIndex = (active: boolean): 0 | -1 => (active ? 0 : -1);

/**
 * Next focus index for an arrow/Home/End key, or null when the key is not a
 * navigation key (so the caller leaves the event alone). Wraps around.
 */
export const nextRadioIndex = (
  count: number,
  current: number,
  key: string,
): number | null => {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
};

/**
 * Container-level key handler: moves focus (and activates) the previous/next
 * radio. Reads the radios out of the DOM so it works for any radiogroup markup
 * without threading indices through.
 */
export const handleRadioGroupKeyDown = (
  e: React.KeyboardEvent<HTMLElement>,
): void => {
  const radios = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  if (radios.length === 0) return;
  const activeIdx = radios.findIndex((r) => r === document.activeElement);
  const next = nextRadioIndex(radios.length, activeIdx < 0 ? 0 : activeIdx, e.key);
  if (next == null) return;
  e.preventDefault();
  const el = radios[next];
  el.focus();
  el.click();
};

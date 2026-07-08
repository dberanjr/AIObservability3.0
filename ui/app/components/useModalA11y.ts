import React from "react";

/**
 * Shared modal accessibility behavior for the app's bespoke (non-Strato)
 * dialogs. Strato's <Modal> already does all of this internally, so only the
 * hand-rolled overlays (ChartModal, DetailModalShell, TweaksPanel,
 * ModelPricingPanel, the Architecture-Map DetailModal) need it.
 *
 * On activation it:
 *   - captures the currently-focused element (the trigger),
 *   - moves focus into the dialog (the `initialFocusRef` target, else the
 *     dialog container — which should carry tabIndex={-1}),
 *   - traps Tab / Shift+Tab within the dialog's focusable set,
 *   - closes on Escape,
 *   - restores focus to the trigger when it deactivates/unmounts.
 *
 * `active` lets always-mounted dialogs (which merely toggle a CSS `.open`
 * class or return null while closed) opt in/out without unmounting.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalA11yOptions {
  /** Element focused on open. Falls back to the dialog container. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /**
   * When false the hook is dormant (no focus capture, no key trap). Defaults
   * to true. Pass the dialog's open flag for modals that stay mounted while
   * closed.
   */
  active?: boolean;
}

export function useModalA11y(
  dialogRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  { initialFocusRef, active = true }: ModalA11yOptions = {},
): void {
  // Focus capture + restore. Keyed only on `active` so a re-created onClose (or
  // any re-render) never re-runs focus capture — the restore target stays the
  // ORIGINAL trigger.
  React.useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current ?? dialogRef.current;
    target?.focus?.();
    return () => previouslyFocused?.focus?.();
    // dialogRef / initialFocusRef are stable ref objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Escape to close + Tab trapped within the dialog. Separate effect so it can
  // depend on onClose without disturbing the focus capture above.
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        // Nothing focusable inside — keep focus pinned to the dialog itself.
        e.preventDefault();
        root.focus?.();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !root.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !root.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose, dialogRef]);
}

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * App-wide "Edit layout" mode. Toggled from a single control in the top header
 * (so it's reachable from every page) and honored by any page's
 * CustomizableGrid, which reveals its drag / resize / reset affordances while
 * this is on. Default off — the calm read-only view.
 */
interface EditLayoutValue {
  editLayout: boolean;
  toggle: () => void;
  setEditLayout: (v: boolean) => void;
}

const EditLayoutCtx = createContext<EditLayoutValue | null>(null);

const NOOP: EditLayoutValue = {
  editLayout: false,
  toggle: () => {},
  setEditLayout: () => {},
};

export const EditLayoutProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [editLayout, setEditLayout] = useState(false);
  const value = useMemo<EditLayoutValue>(
    () => ({ editLayout, setEditLayout, toggle: () => setEditLayout((v) => !v) }),
    [editLayout],
  );
  return (
    <EditLayoutCtx.Provider value={value}>{children}</EditLayoutCtx.Provider>
  );
};

/** Read/toggle the global edit-layout mode. Safe outside the provider (no-op). */
export const useEditLayout = (): EditLayoutValue =>
  useContext(EditLayoutCtx) ?? NOOP;

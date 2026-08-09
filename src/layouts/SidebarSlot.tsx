import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A single portal slot in the app sidebar that a page can fill.
 *
 * Why a portal instead of props: the Calendar page's mini calendar needs that
 * page's own state (selected date, the filtered event set, the active filters)
 * but has to *render* inside the sidebar, which lives in the layout above it.
 * A portal keeps the state where it belongs and avoids threading calendar
 * concerns through DashboardLayout — and because only the page that mounts a
 * SidebarSlotPortal fills it, every other page keeps a clean sidebar.
 */
const SidebarSlotContext = createContext<{
  node: HTMLElement | null;
  register: (node: HTMLElement | null) => void;
} | null>(null);

export function SidebarSlotProvider({ children }: { children: React.ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  // Stable identity: a fresh callback each render would make React detach and
  // re-attach the ref every time, re-triggering setState in a loop.
  const register = useCallback((el: HTMLElement | null) => setNode(el), []);
  const value = useMemo(() => ({ node, register }), [node, register]);
  return <SidebarSlotContext.Provider value={value}>{children}</SidebarSlotContext.Provider>;
}

/**
 * Where slot content lands. Render this EXACTLY ONCE — the desktop sidebar.
 * Mounting a second target (e.g. also inside the mobile drawer, which renders
 * the same sidebar markup) would make the two fight over the single node ref
 * and the content would jump to whichever mounted last.
 */
export function SidebarSlotTarget({ className }: { className?: string }) {
  const ctx = useContext(SidebarSlotContext);
  return <div className={className} ref={ctx?.register} />;
}

/** Renders `children` into the sidebar slot. No-op until the target mounts. */
export function SidebarSlotPortal({ children }: { children: React.ReactNode }) {
  const ctx = useContext(SidebarSlotContext);
  if (!ctx?.node) return null;
  return createPortal(children, ctx.node);
}

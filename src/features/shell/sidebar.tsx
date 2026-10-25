"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/ui/cn";
import { PaletteButton } from "./command-palette";
import { Logo } from "./logo";
import { isActive, primaryNav, settingsNav, type NavItem } from "./nav-items";

const KEY = "inroads:sidebar";
const listeners = new Set<() => void>();
function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === "collapsed";
  } catch {
    return false;
  }
}
function setCollapsed(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? "collapsed" : "open");
  } catch {}
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string | null; collapsed?: boolean }) {
  const active = pathname !== null && isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 font-[550] transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-text",
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
    </Link>
  );
}

type SidebarProps = { spaceSwitcher?: ReactNode };

/**
 * Desktop navigation (≥900px). Highlights the current section once the path is known, and
 * folds down to icons; the choice is remembered in this browser.
 */
export function Sidebar(props: SidebarProps) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  return <SidebarView {...props} pathname={usePathname()} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />;
}

/** Same nav without the current-section highlight, for prerendering (Suspense fallback). */
export function SidebarView({ spaceSwitcher, pathname, collapsed = false, onToggle }: SidebarProps & { pathname: string | null; collapsed?: boolean; onToggle?: () => void }) {
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <nav
      aria-label="Main"
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border py-4 transition-[width] duration-200 md:flex",
        collapsed ? "w-[60px] px-2" : "w-[232px] px-3",
      )}
    >
      <div className={cn("flex items-center gap-2 pb-4", collapsed ? "justify-center" : "px-2.5")}>
        <Logo />
        {collapsed ? null : <span className="font-semibold">Inroads</span>}
      </div>
      {collapsed ? null : <div className="min-h-2 pb-2">{spaceSwitcher}</div>}
      <div className="pb-3">
        <PaletteButton compact={collapsed} />
      </div>
      <div className="grid gap-0.5">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </div>
      <div className="mt-auto grid gap-0.5">
        <NavLink item={settingsNav} pathname={pathname} collapsed={collapsed} />
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-9 items-center gap-2.5 rounded-md px-2.5 font-[550] text-muted transition-colors hover:bg-sunken hover:text-text"
          >
            <Toggle size={16} strokeWidth={1.75} aria-hidden />
            <span className={collapsed ? "sr-only" : undefined}>{collapsed ? "Expand sidebar" : "Collapse"}</span>
          </button>
        ) : null}
      </div>
    </nav>
  );
}

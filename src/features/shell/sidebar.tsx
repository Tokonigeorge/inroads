"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";
import { isActive, primaryNav, type NavItem } from "./nav-items";

function Tab({ item, pathname, rail }: { item: NavItem; pathname: string | null; rail?: boolean }) {
  const active = pathname !== null && isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-[3px] rounded-[12px] text-[11px] leading-none font-semibold tracking-[0.01em]",
        rail ? "px-1 py-3" : "flex-1 px-0.5 pt-[9px] pb-2",
        active ? "text-accent" : "text-faint hover:text-ink",
      )}
    >
      <Icon />
      <span>{item.label}</span>
    </Link>
  );
}

/** Desktop (≥900px): the prototype's 88px rail of icons over labels (L66–75). */
export function Sidebar() {
  return <SidebarView pathname={usePathname()} />;
}

/** Same rail without the current-section highlight, for prerendering (Suspense fallback). */
export function SidebarView({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-25 hidden w-[var(--rail)] content-start gap-1.5 border-r border-line bg-surface px-2 pt-[calc(env(safe-area-inset-top)+76px)] min-[900px]:grid"
    >
      {primaryNav.map((item) => (
        <Tab key={item.href} item={item} pathname={pathname} rail />
      ))}
    </nav>
  );
}

/** Phones and tablets: the same five tabs along the bottom. */
export function BottomTabs({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-25 grid grid-cols-5 border-t border-line bg-surface px-4 pb-[env(safe-area-inset-bottom)] min-[900px]:hidden"
    >
      {primaryNav.map((item) => (
        <Tab key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";
import { useCapture } from "./capture-sheet";
import { isActive, primaryNav, type NavItem } from "./nav-items";

function Tab({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const active = pathname !== null && isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 text-micro", active ? "text-accent" : "text-muted")}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
      {item.label}
    </Link>
  );
}

/** Mobile navigation (<900px): four sections and a central Capture button. */
export function BottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

/** Same nav without the current-section highlight, for prerendering (Suspense fallback). */
export function BottomNavView({ pathname }: { pathname: string | null }) {
  const capture = useCapture();
  const [left, right] = [primaryNav.slice(0, 2), primaryNav.slice(2)];
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(64px+env(safe-area-inset-bottom))] items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {left.map((item) => (
          <Tab key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => capture.open()}
            aria-label="Capture"
            className="flex size-[52px] items-center justify-center rounded-full bg-accent text-on-accent"
          >
            <Plus size={24} aria-hidden />
          </button>
        </div>
        {right.map((item) => (
          <Tab key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
    </>
  );
}

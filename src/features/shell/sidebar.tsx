"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";
import { Logo } from "./logo";
import { isActive, primaryNav, settingsNav, type NavItem } from "./nav-items";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 font-[550]",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-text",
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      {item.label}
    </Link>
  );
}

/** Desktop navigation (≥900px). */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-border px-3 py-4 md:flex">
      <div className="flex items-center gap-2 px-2.5 pb-6">
        <Logo />
        <span className="font-semibold">Inroads</span>
      </div>
      <div className="grid gap-0.5">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
      <div className="mt-auto grid gap-0.5">
        <NavLink item={settingsNav} pathname={pathname} />
      </div>
    </nav>
  );
}

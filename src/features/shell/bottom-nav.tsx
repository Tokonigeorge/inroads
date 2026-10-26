"use client";

import { usePathname } from "next/navigation";
import { BottomTabs } from "./sidebar";

/** Mobile navigation (<900px): the prototype's five tabs. */
export function BottomNav() {
  return <BottomTabs pathname={usePathname()} />;
}

/** Same nav without the current-section highlight, for prerendering (Suspense fallback). */
export function BottomNavView({ pathname }: { pathname: string | null }) {
  return <BottomTabs pathname={pathname} />;
}

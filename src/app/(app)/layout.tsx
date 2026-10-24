import { Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SpaceSwitcherSlot } from "@/features/spaces/space-switcher-slot";
import { BottomNav, BottomNavView } from "@/features/shell/bottom-nav";
import { Logo } from "@/features/shell/logo";
import { Sidebar, SidebarView } from "@/features/shell/sidebar";
import { AppProviders } from "@/features/shell/app-providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const switcher = (
    <Suspense fallback={null}>
      <SpaceSwitcherSlot className="w-full justify-between" />
    </Suspense>
  );
  return (
    <AppProviders>
      <div className="flex min-h-dvh">
        <Suspense fallback={<SidebarView pathname={null} spaceSwitcher={switcher} />}>
          <Sidebar spaceSwitcher={switcher} />
        </Suspense>
        <div className="min-w-0 flex-1">
          {/* Mobile header: Space switcher (when there's more than one in use) and Settings. */}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-bg px-2 md:hidden">
            <Suspense fallback={<Logo />}>
              <div className="flex min-w-0 items-center gap-1 pl-2">
                <Logo />
                <SpaceSwitcherSlot />
              </div>
            </Suspense>
            <Link href="/settings" aria-label="Settings" className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-sunken">
              <Settings size={20} strokeWidth={1.75} aria-hidden />
            </Link>
          </header>
          <main className="pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
        </div>
      </div>
      <Suspense fallback={<BottomNavView pathname={null} />}>
        <BottomNav />
      </Suspense>
    </AppProviders>
  );
}

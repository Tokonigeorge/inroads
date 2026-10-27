import { Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SpaceSwitcherSlot } from "@/features/spaces/space-switcher-slot";
import { BottomNav, BottomNavView } from "@/features/shell/bottom-nav";
import { CaptureButton } from "@/features/shell/capture-button";
import { PaletteButton } from "@/features/shell/command-palette";
import { Logo } from "@/features/shell/logo";
import { Sidebar, SidebarView } from "@/features/shell/sidebar";
import { StatusPill } from "@/features/shell/status-pill";
import { AppProviders } from "@/features/shell/app-providers";

/**
 * The prototype's chrome (L358–367): a sticky brand bar with the status pill, one 960px column,
 * and five tabs (a bottom bar on phones, an 88px rail from 900px).
 */
export default function AppLayout({ children, sheet }: { children: React.ReactNode; sheet: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="min-h-dvh min-[900px]:pl-[var(--rail)]">
        <header className="sticky top-[env(safe-area-inset-top)] z-20 bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-[10px] backdrop-saturate-[1.4]">
          <div className="mx-auto flex max-w-[960px] items-center justify-between gap-3 px-4 py-3">
            <Link href="/today" className="flex shrink-0 items-center gap-[9px] font-display text-[20px] leading-none font-[760] tracking-[-0.02em]">
              <Logo size={26} />
              <span>Inroads</span>
            </Link>
            <div className="flex min-w-0 shrink items-center gap-1.5">
              <Suspense fallback={null}>
                <SpaceSwitcherSlot />
              </Suspense>
              <Suspense fallback={null}>
                <StatusPill />
              </Suspense>
              <PaletteButton compact />
              <CaptureButton />
              <Link href="/settings" aria-label="Settings" className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-sunk hover:text-ink">
                <Settings size={20} strokeWidth={1.7} aria-hidden />
              </Link>
            </div>
          </div>
        </header>
        <main className="pb-[calc(96px+env(safe-area-inset-bottom))] min-[900px]:pb-16">{children}</main>
      </div>
      {sheet}
      <Suspense fallback={<SidebarView pathname={null} />}>
        <Sidebar />
      </Suspense>
      <Suspense fallback={<BottomNavView pathname={null} />}>
        <BottomNav />
      </Suspense>
    </AppProviders>
  );
}

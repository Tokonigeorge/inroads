import { BottomNav } from "@/features/shell/bottom-nav";
import { Sidebar } from "@/features/shell/sidebar";
import { ToastProvider } from "@/ui/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>
      <BottomNav />
    </ToastProvider>
  );
}

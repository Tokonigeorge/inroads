import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { SpaceSwitcher } from "./space-switcher";
import { loadSpaceView } from "./space-view";

/** Server wrapper: decides whether to show the switcher and with what. Render inside <Suspense>. */
export async function SpaceSwitcherSlot({ className }: { className?: string }) {
  const user = await getSessionUser();
  if (!user) return null;
  const view = await db.withUser(user.id, loadSpaceView);
  if (!view.showSwitcher) return null;
  return <SpaceSwitcher spaces={view.spaces.map((s) => ({ id: s.id, name: s.name }))} selectedId={view.selected?.id ?? null} className={className} />;
}

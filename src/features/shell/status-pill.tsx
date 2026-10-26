import Link from "next/link";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listConnections } from "@/server/repos/connections";
import { cn } from "@/ui/cn";

/**
 * The prototype's status pill (L691–699): how your data is syncing, and whether the AI can run.
 * "Synced", "Sync stopped" (an account needs reconnecting) or "Not connected", plus " · AI off".
 * Opens Connections.
 */
export async function StatusPill() {
  const user = await requireUser();
  const accounts = await db.withUser(user.id, listConnections);
  const ai = isAiConfigured();
  const stopped = accounts.some((a) => a.status === "error");
  const sync = stopped ? "Sync stopped" : accounts.length ? "Synced" : "Not connected";
  const label = `${sync}${ai ? "" : " · AI off"}`;
  const ok = !stopped && accounts.length > 0 && ai;
  return (
    <Link
      href="/settings/connections"
      aria-label={`Connections: ${label}`}
      className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-line bg-surface px-2.5 py-[7px] font-mono text-[12px] leading-none whitespace-nowrap text-muted"
    >
      <i aria-hidden className={cn("size-[7px] rounded-full", ok ? "bg-good" : stopped || !ai ? "bg-warn" : "bg-faint")} />
      <span className="hidden min-[480px]:inline">{label}</span>
    </Link>
  );
}

import "server-only";
import type { Tx } from "@/server/db/with-user";

/**
 * Runs a write in a savepoint so a rule violation from a trigger can be turned into a
 * message without aborting the surrounding transaction.
 */
export async function guarded<T>(tx: Tx, fn: (sp: Tx) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await tx.transaction(fn) };
  } catch (e) {
    const m = constraintMessage(e);
    if (m) return { ok: false, message: m };
    throw e;
  }
}

function constraintMessage(e: unknown): string | null {
  const msg = String((e as { cause?: { message?: string }; message?: string })?.cause?.message ?? (e as Error)?.message ?? "");
  if (msg.includes("goal is in a different Space")) return "That goal belongs to a different Space.";
  if (msg.includes("person is not in this Space")) return "They're not in this Space. Add them to it first.";
  if (msg.includes("does not belong to this account")) return "That isn't one of yours.";
  return null;
}

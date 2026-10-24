import "server-only";
import { cookies } from "next/headers";

export const SPACE_COOKIE = "inroads-space";

/**
 * The Space the user is looking at, or null for "All spaces". Stored in a cookie so the
 * choice survives reloads and works in server-rendered lists. Callers must check the id
 * against the user's own Spaces (RLS would hide anyone else's anyway).
 */
export async function readSelectedSpaceId(): Promise<string | null> {
  const value = (await cookies()).get(SPACE_COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/** Picks the selected Space if it's still one of `spaces`, otherwise "All spaces". */
export function resolveSelectedSpace<T extends { id: string }>(spaces: T[], selectedId: string | null): T | null {
  return (selectedId && spaces.find((s) => s.id === selectedId)) || null;
}

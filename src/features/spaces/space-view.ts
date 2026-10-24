import "server-only";
import type { Tx } from "@/server/db/with-user";
import { listSpaces, type SpaceRow } from "@/server/repos/spaces";
import { readSelectedSpaceId, resolveSelectedSpace } from "@/server/space-selection";

export type SpaceView = { spaces: SpaceRow[]; selected: SpaceRow | null; showSwitcher: boolean };

/**
 * The user's active Spaces and which one they're looking at. The switcher stays hidden until a
 * second Space has people in it (DECISIONS #13), unless a Space is already selected.
 */
export async function loadSpaceView(tx: Tx): Promise<SpaceView> {
  const [spaces, selectedId] = await Promise.all([listSpaces(tx), readSelectedSpaceId()]);
  const selected = resolveSelectedSpace(spaces, selectedId);
  const inUse = spaces.filter((s) => s.people > 0).length;
  return { spaces, selected, showSwitcher: inUse >= 2 || selected !== null };
}

import "server-only";
import type { Tx } from "@/server/db/with-user";
import { listCircles } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import type { SpaceOption } from "./person-defaults";

export async function loadSpaceOptions(tx: Tx): Promise<SpaceOption[]> {
  const [spaces, circles] = await Promise.all([listSpaces(tx), listCircles(tx)]);
  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    defaultCadenceDays: s.defaults.cadenceDays,
    circles: circles.filter((c) => c.spaceId === s.id).map((c) => ({ id: c.id, name: c.name, defaultCadenceDays: c.defaultCadenceDays })),
  }));
}

import "server-only";
import type { SpaceKind } from "@/contracts/spaces";
import type { Tx } from "@/server/db/with-user";
import { listSpaces } from "@/server/repos/spaces";
import type { GoalFormSpace } from "./goal-form";

export async function goalFormSpaces(tx: Tx): Promise<GoalFormSpace[]> {
  return (await listSpaces(tx)).map((s) => ({ id: s.id, name: s.name, kind: s.kind as SpaceKind, stages: s.defaults.stages }));
}

import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { pendingTriageCount } from "@/server/repos/connections";
import { countDuplicates } from "@/server/repos/merge";
import { listCircles, listTags } from "@/server/repos/people";
import { userContext } from "@/server/user-context";
import { PeopleList } from "./people-list";

export async function PeopleListPane() {
  const user = await requireUser();
  const { view, tags, circles, today, toSort, duplicates } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    const spaceId = view.selected?.id ?? null;
    const [tags, circles, ctx, toSort, duplicates] = await Promise.all([
      listTags(tx, spaceId),
      spaceId ? listCircles(tx, spaceId) : Promise.resolve([]),
      userContext(tx),
      pendingTriageCount(tx, spaceId),
      countDuplicates(tx),
    ]);
    return { view, tags: tags.map((t) => t.tag), circles: circles.map((c) => ({ id: c.id, name: c.name })), today: ctx.today, toSort, duplicates };
  });
  return (
    <PeopleList
      key={view.selected?.id ?? "all"}
      today={today}
      spaceId={view.selected?.id ?? null}
      spaceName={view.selected?.name ?? null}
      showSpaces={view.spaces.length > 1}
      tags={tags}
      circles={circles}
      toSort={toSort}
      duplicates={duplicates}
    />
  );
}

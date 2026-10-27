import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { pendingTriageCount } from "@/server/repos/connections";
import { countDuplicates } from "@/server/repos/merge";
import { listCircles, listTags, peopleCounts } from "@/server/repos/people";
import { userContext } from "@/server/user-context";
import { PageHeader } from "@/ui/layout";
import { PeopleList } from "./people-list";

/** The People tab: the prototype's hero ("{n} people · {n} cooling", "Your network") over the list. */
export async function PeopleListPane() {
  const user = await requireUser();
  const { view, tags, circles, today, toSort, duplicates, counts } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    const spaceId = view.selected?.id ?? null;
    const ctx = await userContext(tx);
    const [tags, circles, toSort, duplicates, counts] = await Promise.all([
      listTags(tx, spaceId),
      spaceId ? listCircles(tx, spaceId) : Promise.resolve([]),
      pendingTriageCount(tx, spaceId),
      countDuplicates(tx),
      peopleCounts(tx, spaceId, ctx.today),
    ]);
    return { view, tags: tags.map((t) => t.tag), circles: circles.map((c) => ({ id: c.id, name: c.name })), today: ctx.today, toSort, duplicates, counts };
  });
  return (
    <>
      <PageHeader stamp={`${counts.total.toLocaleString("en-GB")} people · ${counts.cooling.toLocaleString("en-GB")} cooling`} title="Your network" />
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
        total={counts.total}
      />
    </>
  );
}

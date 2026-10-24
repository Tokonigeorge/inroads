import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listPast, listSeries, listUpcoming } from "@/server/repos/rooms";
import { userContext } from "@/server/user-context";
import { RoomsList } from "./rooms-list";

export async function RoomsListPane() {
  const user = await requireUser();
  const data = await db.withUser(user.id, async (tx) => {
    const [view, ctx] = await Promise.all([loadSpaceView(tx), userContext(tx)]);
    const spaceId = view.selected?.id ?? null;
    const [upcoming, series, past] = await Promise.all([listUpcoming(tx, spaceId, ctx.today, ctx.timezone, 60), listSeries(tx, spaceId, ctx.today), listPast(tx, spaceId, ctx.today)]);
    return { today: ctx.today, upcoming, series, past, spaceName: view.selected?.name ?? null };
  });
  return <RoomsList {...data} />;
}

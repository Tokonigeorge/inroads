import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { formatLongDate } from "@/domain/dates";
import { AiJobButton } from "@/features/ai/ai-job-button";
import { RoomIdeas, type RoomIdea } from "@/features/ai/room-ideas";
import { LoadingRows } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { Pane } from "@/ui/layout";

export const metadata: Metadata = { title: "Suggested rooms" };
export const maxDuration = 300;

export default function SuggestedRoomsPage() {
  return (
    <Pane header={<h1 className="text-title font-semibold">Suggested rooms</h1>}>
      <div className="max-w-[720px]">
        <Suspense fallback={<LoadingRows rows={4} />}>
          <Suggested />
        </Suspense>
      </div>
    </Pane>
  );
}

async function Suggested() {
  const user = await requireUser();
  const { space, latest } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    const space = view.selected ?? view.spaces.find((s) => s.kind === "work") ?? view.spaces[0];
    if (!space) return { space: null, latest: null };
    const [latest] = await tx
      .select()
      .from(t.searches)
      .where(and(eq(t.searches.type, "radar"), eq(t.searches.spaceId, space.id)))
      .orderBy(desc(t.searches.createdAt))
      .limit(1);
    return { space, latest: latest ?? null };
  });
  if (!space) return <p className="text-muted">Create a Space first.</p>;
  const result = latest?.result as { items: RoomIdea[]; from: string; to: string } | undefined;
  return (
    <div className="grid gap-6">
      <p className="text-muted">
        Events in the next three weeks that serve your {space.name} goals, found on the web. Switch Space to look for another side of your life.
      </p>
      <AiJobButton aiEnabled={isAiConfigured()} variant={latest ? "secondary" : "primary"} size="md" job={{ kind: "radar", spaceId: space.id }} label={latest ? "Find rooms again" : "Find rooms"} />
      {latest && result ? (
        <>
          <p className="text-small text-muted">
            Found {formatLongDate(result.from)} for the three weeks to {formatLongDate(result.to)}.
          </p>
          <RoomIdeas searchId={latest.id} items={result.items} />
        </>
      ) : null}
    </div>
  );
}

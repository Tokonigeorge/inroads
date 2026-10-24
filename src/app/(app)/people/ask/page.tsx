import type { Metadata } from "next";
import { Suspense } from "react";
import { AskNetwork } from "@/features/people/ask-network";
import { LoadingRows } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { Pane } from "@/ui/layout";

export const metadata: Metadata = { title: "Ask your network" };

export default function AskPage() {
  return (
    <Pane header={<h1 className="text-title font-semibold">Ask your network</h1>}>
      <p className="max-w-[640px] pb-6 text-muted">Ask in your own words. Inroads looks through the people you know in one Space: their details, your notes, research and recent touches.</p>
      <Suspense fallback={<LoadingRows rows={3} />}>
        <Ask />
      </Suspense>
    </Pane>
  );
}

async function Ask() {
  const user = await requireUser();
  const view = await db.withUser(user.id, (tx) => loadSpaceView(tx));
  const spaces = view.spaces.filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name }));
  if (!spaces.length) return <p className="text-muted">Add a Space first.</p>;
  return <AskNetwork spaces={spaces} defaultSpaceId={view.selected?.id ?? spaces[0].id} aiEnabled={isAiConfigured()} />;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AskNetwork } from "@/features/people/ask-network";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { BackLink } from "@/ui/back-link";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Ask your network" };

export default function AskPage({ searchParams }: PageProps<"/ask">) {
  return (
    <PageFrame>
      <BackLink fallback="/people" />
      <PageHeader
        stamp="People"
        title="Ask your network"
        subtitle="Ask in your own words. Inroads looks through the people you know in one Space: their details, your notes, research and recent touches."
      />
      <Suspense fallback={<LoadingRows rows={3} />}>
        <Ask searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function Ask({ searchParams }: { searchParams: PageProps<"/ask">["searchParams"] }) {
  const [user, q] = await Promise.all([requireUser(), searchParams]);
  const question = typeof q.q === "string" ? q.q.slice(0, 300) : "";
  const view = await db.withUser(user.id, (tx) => loadSpaceView(tx));
  const spaces = view.spaces.filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name }));
  if (!spaces.length) return <p className="text-muted">Add a Space first.</p>;
  return <AskNetwork spaces={spaces} defaultSpaceId={view.selected?.id ?? spaces[0].id} aiEnabled={isAiConfigured()} initialQuestion={question} />;
}

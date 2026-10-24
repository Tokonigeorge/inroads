import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { SpaceKind } from "@/contracts/spaces";
import { CirclesEditor } from "@/features/spaces/circles-editor";
import { EditSpaceForm } from "@/features/spaces/edit-space-form";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listCircles } from "@/server/repos/people";
import { getSpace } from "@/server/repos/spaces";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Space" };

export default function SpacePage({ params }: PageProps<"/settings/spaces/[id]">) {
  return (
    <PageFrame>
      <Link href="/settings#spaces" className="text-small text-muted hover:text-text">
        Settings
      </Link>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <SpaceEditor params={params} />
      </Suspense>
    </PageFrame>
  );
}

async function SpaceEditor({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => {
    const space = await getSpace(tx, id);
    return space ? { space, circles: await listCircles(tx, space.id) } : null;
  });
  if (!data) notFound();
  const { space, circles } = data;
  return (
    <>
      <PageHeader title={space.name} subtitle={space.archivedAt ? "Archived" : undefined} />
      <EditSpaceForm
        space={{
          id: space.id,
          name: space.name,
          kind: space.kind as SpaceKind,
          archived: Boolean(space.archivedAt),
          people: space.people,
          defaults: space.defaults,
        }}
      />
      <div className="pt-10">
        <CirclesEditor spaceId={space.id} circles={circles} spaceDefault={space.defaults.cadenceDays} />
      </div>
    </>
  );
}

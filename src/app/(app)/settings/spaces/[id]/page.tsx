import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { SpaceKind } from "@/contracts/spaces";
import { EditSpaceForm } from "@/features/spaces/edit-space-form";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
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
  const space = await db.withUser(user.id, (tx) => getSpace(tx, id));
  if (!space) notFound();
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
    </>
  );
}

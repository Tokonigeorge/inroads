import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { readShare } from "@/domain/share";
import { SharedProfile, SharedText } from "@/features/share/share-review";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getShare, personWithSocial } from "@/server/repos/share";
import { listSpaces } from "@/server/repos/spaces";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Shared with Inroads" };

export default function SharePage({ params }: PageProps<"/share/[id]">) {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows rows={4} />}>
        <Share params={params} />
      </Suspense>
    </PageFrame>
  );
}

async function Share({ params }: { params: PageProps<"/share/[id]">["params"] }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => {
    const share = await getShare(tx, id);
    if (!share) return null;
    const read = readShare(share.input);
    const [spaces, existing] = await Promise.all([listSpaces(tx), read.kind === "profile" ? personWithSocial(tx, read.social, read.url) : null]);
    return { share, read, spaces: spaces.map((s) => ({ id: s.id, name: s.name })), existing };
  });
  if (!data) notFound();
  const { share, read } = data;
  if (read.kind === "profile") {
    return (
      <>
        <PageHeader title={data.existing ? "Already in Inroads" : "Add this person"} subtitle="From a profile you shared." />
        <SharedProfile shareId={share.id} read={read} spaces={data.spaces} spaceId={share.spaceId} existing={data.existing} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Capture what you shared" subtitle="Inroads reads it like a quick capture. Check it before saving." />
      {read.kind === "text" ? <SharedText shareId={share.id} text={read.text} /> : <p className="text-muted">There was nothing to read in that share.</p>}
    </>
  );
}

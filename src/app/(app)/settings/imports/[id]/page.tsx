import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ImportReview, importTitle } from "@/features/connections/import-review";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Review import" };
export const maxDuration = 60;

/** An import opened from a link or a refresh. Inside the app it opens as a sheet. */
export default function ImportReviewPage({ params, searchParams }: PageProps<"/settings/imports/[id]">) {
  return (
    <PageFrame>
      <Link href="/settings/connections" className="text-small text-muted hover:text-text">
        Connections
      </Link>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Review params={params} searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function Review({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: PageProps<"/settings/imports/[id]">["searchParams"] }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const page = Math.max(0, Number(Array.isArray(q.page) ? q.page[0] : (q.page ?? 0)) || 0);
  return (
    <>
      <PageHeader title={await importTitle(id)} />
      <div className="max-w-[620px]">
        <ImportReview id={id} page={page} />
      </div>
    </>
  );
}

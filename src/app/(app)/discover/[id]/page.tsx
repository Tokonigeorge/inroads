import type { Metadata } from "next";
import { Suspense } from "react";
import { DiscoverView } from "@/features/ai/discover-view";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Discover" };
export const maxDuration = 300;

/** A decoded room: the decoder with its result under it, as in the prototype. */
export default function LookupResultPage({ params }: PageProps<"/discover/[id]">) {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Result params={params} />
      </Suspense>
    </PageFrame>
  );
}

async function Result({ params }: { params: Promise<{ id: string }> }) {
  return <DiscoverView resultId={(await params).id} />;
}

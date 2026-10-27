import type { Metadata } from "next";
import { Suspense } from "react";
import { DiscoverView } from "@/features/ai/discover-view";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Discover" };
export const maxDuration = 300;

/** The prototype's Discover tab, the room decoder. `?q=&type=` comes from "Decode their world" and Radar's "Decode". */
export default function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows rows={4} />}>
        <Discover searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function Discover({ searchParams }: { searchParams: PageProps<"/discover">["searchParams"] }) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, 200);
  };
  return <DiscoverView q={one("q")} type={one("type")} />;
}

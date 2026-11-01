import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { layoutNetwork } from "@/domain/network-map";
import { NetworkMap } from "@/features/people/network-map";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { loadNetworkMap, MAP_LIMIT } from "@/server/repos/network-map";
import { userContext } from "@/server/user-context";
import { BackLink } from "@/ui/back-link";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Network map" };

export default function MapPage() {
  return (
    <PageFrame>
      <BackLink fallback="/people" />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <MapSection />
      </Suspense>
    </PageFrame>
  );
}

async function MapSection() {
  const user = await requireUser();
  const { map, spaceName } = await db.withUser(user.id, async (tx) => {
    const [view, ctx] = await Promise.all([loadSpaceView(tx), userContext(tx)]);
    return { map: await loadNetworkMap(tx, view.selected?.id ?? null, ctx.today), spaceName: view.selected?.name ?? "All spaces" };
  });
  // Only people you've been in touch with (or starred) have a place on the map; the rest are counted.
  const onMap = map.people.filter((p) => p.strength != null || p.starred);
  const untouched = map.total - onMap.length;
  // Only when the cap actually cut off people you've been in touch with.
  const capped = map.total > MAP_LIMIT && onMap.length === map.people.length;
  const placed = layoutNetwork(onMap, map.goals);
  const strong = onMap.filter((p) => (p.strength ?? 0) >= 70).length;
  const fading = onMap.filter((p) => p.strength != null && p.strength < 40).length;
  return (
    <>
      <PageHeader
        stamp={`${spaceName} · ${map.total.toLocaleString("en-GB")} ${map.total === 1 ? "person" : "people"}`}
        title="Network map"
        subtitle={
          onMap.length
            ? `${strong} strong, ${fading} fading or weak.${capped ? ` Showing your ${MAP_LIMIT} closest and starred.` : ""} Log a touch and they move closer.`
            : undefined
        }
      />
      {placed.length ? <NetworkMap people={placed} goals={map.goals} /> : null}
      {untouched > 0 ? (
        <p className="mt-4 text-center text-small text-muted">
          {untouched.toLocaleString("en-GB")} more {untouched === 1 ? "person isn't" : "people aren't"} on the map: {capped ? `no touches logged yet, or past your closest ${MAP_LIMIT}` : "no touches logged yet"}.{" "}
          <Link href="/people" className="font-semibold text-accent hover:underline">
            Log a touch
          </Link>{" "}
          with someone and they appear here.
        </p>
      ) : null}
      {placed.length || untouched > 0 ? null : (
        <p className="text-muted">
          No one here yet.{" "}
          <Link href="/people/new" className="font-semibold text-accent hover:underline">
            Add people
          </Link>{" "}
          and log a touch, and they&apos;ll show up around you.
        </p>
      )}
    </>
  );
}

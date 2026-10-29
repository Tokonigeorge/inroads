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
  const placed = layoutNetwork(map.people, map.goals);
  const strong = map.people.filter((p) => (p.strength ?? 0) >= 70).length;
  const fading = map.people.filter((p) => p.strength != null && p.strength < 40).length;
  return (
    <>
      <PageHeader
        stamp={`${spaceName} · ${map.total.toLocaleString("en-GB")} ${map.total === 1 ? "person" : "people"}`}
        title="Network map"
        subtitle={
          map.people.length
            ? `${strong} strong, ${fading} fading or weak.${map.total > MAP_LIMIT ? ` Showing your ${MAP_LIMIT} closest and starred.` : ""} Log a touch and they move closer.`
            : undefined
        }
      />
      {placed.length ? (
        <NetworkMap people={placed} goals={map.goals} />
      ) : (
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

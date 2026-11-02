import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NetworkMap } from "@/features/people/network-map";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { loadMapLinks, loadNetworkMap, MAP_LIMIT } from "@/server/repos/network-map";
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
  const { map, links, spaceName } = await db.withUser(user.id, async (tx) => {
    const [view, ctx] = await Promise.all([loadSpaceView(tx), userContext(tx)]);
    const map = await loadNetworkMap(tx, view.selected?.id ?? null, ctx.today);
    // On the map: people you've been in touch with, starred, on a goal, or linked to someone.
    const onMap = map.people.filter((p) => p.strength != null || p.starred || p.goalId || p.linked);
    return { map: { ...map, people: onMap }, links: await loadMapLinks(tx, onMap.map((p) => p.id)), spaceName: view.selected?.name ?? "All spaces" };
  });
  const onMap = map.people;
  const rest = map.total - onMap.length;
  const strong = onMap.filter((p) => (p.strength ?? 0) >= 70).length;
  return (
    <>
      <PageHeader
        stamp={`${spaceName} · ${map.total.toLocaleString("en-GB")} ${map.total === 1 ? "person" : "people"}`}
        title="Network map"
        subtitle={
          onMap.length
            ? `${onMap.length} people, ${strong} strong, ${links.length} ${links.length === 1 ? "connection" : "connections"} between them. Closeness comes from the contact you log here, so someone you're close to but haven't logged sits further out.`
            : undefined
        }
      />
      {onMap.length ? <NetworkMap people={onMap} links={links} goals={map.goals} /> : null}
      {rest > 0 ? (
        <p className="mt-4 text-center text-small text-muted">
          {rest.toLocaleString("en-GB")} more {rest === 1 ? "person isn't" : "people aren't"} on the map: no contact logged, no goal and no connection yet{map.total > MAP_LIMIT ? `, or past the first ${MAP_LIMIT}` : ""}.{" "}
          <Link href="/people" className="font-semibold text-accent hover:underline">
            Log a touch
          </Link>{" "}
          with someone and they appear here.
        </p>
      ) : null}
      {onMap.length || rest > 0 ? null : (
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

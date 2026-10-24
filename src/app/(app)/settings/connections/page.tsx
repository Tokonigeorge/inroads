import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConnectionsSection } from "@/features/connections/connections-section";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage({ searchParams }: PageProps<"/settings/connections">) {
  return (
    <PageFrame>
      <Link href="/settings" className="text-small text-muted hover:text-text">
        Settings
      </Link>
      <PageHeader title="Connections" subtitle="Bring in the people and meetings you already have. Inroads only reads; it never changes your contacts or calendar." />
      <Suspense fallback={<LoadingRows rows={5} />}>
        <ConnectionsSection searchParams={searchParams} returnTo="/settings/connections" />
      </Suspense>
    </PageFrame>
  );
}

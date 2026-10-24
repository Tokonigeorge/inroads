import type { Metadata } from "next";
import Link from "next/link";
import { NewSpaceForm } from "@/features/spaces/new-space-form";
import { PageFrame } from "@/features/shell/page-frame";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Add a Space" };

export default function NewSpacePage() {
  return (
    <PageFrame>
      <Link href="/settings#spaces" className="text-small text-muted hover:text-text">
        Settings
      </Link>
      <PageHeader title="Add a Space" />
      <NewSpaceForm />
    </PageFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DeleteAccount } from "@/features/settings/delete-account";
import { SpacesSettings } from "@/features/spaces/spaces-settings";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { getAccountOverview } from "@/server/repos/account";
import { Button } from "@/ui/button";
import { PageHeader, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Account" };

export default function SettingsPage() {
  return (
    <PageFrame>
      <PageHeader
        stamp="Account"
        title="Account and Spaces"
        subtitle="Your profile and goals, backup and the example network are on the Goals tab. This page has the rest."
        actions={
          <Button asChild size="sm">
            <Link href="/goals">← Goals</Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Settings />
      </Suspense>
    </PageFrame>
  );
}

async function Settings() {
  const user = await requireUser();
  const { profile, spaces } = await getAccountOverview(user.id);
  return (
    <>
      <Section
        title="Profile"
        action={
          <Button asChild size="sm">
            <Link href="/settings/profile">Edit profile</Link>
          </Button>
        }
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted">Name</dt>
          <dd>{profile.name || "Not set"}</dd>
          <dt className="text-muted">Email</dt>
          <dd>{user.email ?? "Not set"}</dd>
          <dt className="text-muted">Headline</dt>
          <dd>{profile.headline || "Not set"}</dd>
          <dt className="text-muted">Time zone</dt>
          <dd>{profile.timezone.replace(/_/g, " ")}</dd>
          <dt className="text-muted">Brief time</dt>
          <dd>{profile.briefTime.slice(0, 5)}</dd>
        </dl>
      </Section>

      <SpacesSettings spaces={spaces} />

      <Section title="Connections">
        <div className="grid gap-3">
          <p className="text-muted">Bring in contacts and meetings from Google, Outlook, a calendar link, your phone or a file.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/settings/connections">Manage connections</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/settings/connections#imports">Import history</Link>
            </Button>
          </div>
        </div>
      </Section>

      <Section title="AI">
        <div className="grid gap-3">
          <p className="text-muted">Research, drafts, briefs and suggested rooms, with daily limits and a monthly allowance.</p>
          <div>
            <Button asChild>
              <Link href="/settings/usage">See usage</Link>
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Account">
        <div className="grid gap-6">
          <form action="/auth/sign-out" method="post">
            <Button type="submit">Sign out</Button>
          </form>
          <DeleteAccount email={user.email} />
        </div>
      </Section>
    </>
  );
}

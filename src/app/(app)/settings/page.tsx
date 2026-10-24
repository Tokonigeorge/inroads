import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DeleteAccount } from "@/features/settings/delete-account";
import { ExampleDataForm } from "@/features/settings/example-data-form";
import { ExportPanel } from "@/features/settings/export-panel";
import { SpacesSettings } from "@/features/spaces/spaces-settings";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { latestExport } from "@/server/account/export";
import { db } from "@/server/db/client";
import { getAccountOverview } from "@/server/repos/account";
import { Button } from "@/ui/button";
import { PageHeader, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageFrame>
      <PageHeader title="Settings" />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Settings />
      </Suspense>
    </PageFrame>
  );
}

async function Settings() {
  const user = await requireUser();
  const [{ profile, spaces, counts }, latest] = await Promise.all([getAccountOverview(user.id), db.withUser(user.id, latestExport)]);
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: profile.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
          <dt className="text-muted">What you do</dt>
          <dd>{profile.headline || "Not set"}</dd>
          <dt className="text-muted">Time zone</dt>
          <dd>{profile.timezone.replace(/_/g, " ")}</dd>
          <dt className="text-muted">Brief time</dt>
          <dd>{profile.briefTime.slice(0, 5)}</dd>
        </dl>
      </Section>

      <Section title="Goals">
        <div className="grid gap-3">
          <p className="text-muted">{counts.goals === 1 ? "1 active goal." : `${counts.goals} active goals.`} Goals shape your reminders, research and suggested rooms.</p>
          <div>
            <Button asChild>
              <Link href="/goals">Manage goals</Link>
            </Button>
          </div>
        </div>
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

      <Section title="Export">
        <ExportPanel
          latest={
            latest
              ? { id: latest.id, filename: latest.filename, size: formatSize(latest.sizeBytes), made: when.format(latest.createdAt), until: when.format(latest.expiresAt) }
              : null
          }
        />
      </Section>

      <Section title="Example data">
        <div id="data" className="grid gap-3">
          <p className="text-muted">
            {counts.examples
              ? "The example network is loaded. Example records are marked and safe to remove."
              : "Load six example people and four rooms from Lagos to see how Inroads works with data in it."}
          </p>
          <div>
            <ExampleDataForm loaded={counts.examples > 0} />
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

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

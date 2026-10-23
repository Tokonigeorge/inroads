import type { Metadata } from "next";
import { Suspense } from "react";
import { ExampleDataForm } from "@/features/settings/example-data-form";
import { SpacesSettings } from "@/features/spaces/spaces-settings";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
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
  const { profile, spaces, counts } = await getAccountOverview(user.id);
  return (
    <>
      <Section title="Profile">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted">Name</dt>
          <dd>{profile.name || "Not set"}</dd>
          <dt className="text-muted">Email</dt>
          <dd>{user.email ?? "Not set"}</dd>
          <dt className="text-muted">Time zone</dt>
          <dd>{profile.timezone}</dd>
        </dl>
      </Section>

      <SpacesSettings spaces={spaces} />

      <Section title="Data">
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
        <form action="/auth/sign-out" method="post">
          <Button type="submit">Sign out</Button>
        </form>
      </Section>
    </>
  );
}

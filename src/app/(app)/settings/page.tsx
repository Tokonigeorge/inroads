import type { Metadata } from "next";
import { Suspense } from "react";
import { spaceDefaultsSchema } from "@/contracts/spaces";
import { ExampleDataForm } from "@/features/settings/example-data-form";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { getAccountOverview } from "@/server/repos/account";
import { Button } from "@/ui/button";
import { PageHeader, Section } from "@/ui/layout";
import { ListRow } from "@/ui/list-row";

export const metadata: Metadata = { title: "Settings" };

const researchLabel = { full: "Full research", get_to_know: "Get to know", off: "Research off" } as const;

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

      <Section title="Spaces">
        <ul className="-mx-4">
          {spaces.map((s) => {
            const d = spaceDefaultsSchema.safeParse(s.defaults);
            const detail = d.success
              ? [d.data.cadenceDays ? `Keep in touch every ${d.data.cadenceDays} days` : "No default reminder", researchLabel[d.data.researchMode]].join(" · ")
              : "";
            return (
              <li key={s.id}>
                <ListRow primary={s.name} secondary={detail} />
              </li>
            );
          })}
        </ul>
      </Section>

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

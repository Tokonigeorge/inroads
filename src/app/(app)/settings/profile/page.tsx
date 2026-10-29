import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { countries, timezonesWith } from "@/features/settings/locale-options";
import { ProfileForm } from "@/features/settings/profile-form";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { getAccountOverview } from "@/server/repos/account";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <PageFrame>
      <Link href="/settings" className="text-small text-muted hover:text-text">
        Settings
      </Link>
      <PageHeader title="Profile" subtitle="Only you see this. AI features use it as context about you." />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Profile />
      </Suspense>
    </PageFrame>
  );
}

async function Profile() {
  const user = await requireUser();
  const { profile: p } = await getAccountOverview(user.id);
  return (
    <ProfileForm
      profile={{
        name: p.name,
        headline: p.headline,
        location: p.location,
        background: p.background,
        offerings: p.offerings,
        aiNotes: p.aiNotes,
        industries: p.industries,
        timezone: p.timezone,
        region: p.defaultRegion,
        briefTime: p.briefTime.slice(0, 5),
      }}
      timezones={timezonesWith(p.timezone)}
      countries={countries}
    />
  );
}

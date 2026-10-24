import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatPhone } from "@/domain/normalise";
import { ImportReviewActions } from "@/features/connections/import-review-actions";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getStagedImport } from "@/server/import/files";
import { listSpaces } from "@/server/repos/spaces";
import { PageHeader, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Review import" };
export const maxDuration = 60;

export default function ImportReviewPage({ params, searchParams }: PageProps<"/settings/imports/[id]">) {
  return (
    <PageFrame>
      <Link href="/settings/connections" className="text-small text-muted hover:text-text">
        Connections
      </Link>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Review params={params} searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

const fieldNames: Record<string, string> = { emails: "email", phones: "phone", company: "company", position: "role", city: "city", birthday: "birthday", socials: "profiles", name: "name" };
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

async function Review({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: PageProps<"/settings/imports/[id]">["searchParams"] }) {
  const [{ id }, q, user] = await Promise.all([params, searchParams, requireUser()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const page = Math.max(0, Number(Array.isArray(q.page) ? q.page[0] : (q.page ?? 0)) || 0);
  const data = await db.withUser(user.id, async (tx) => ({ staged: await getStagedImport(tx, id, { page }), spaces: await listSpaces(tx) }));
  if (!data.staged) notFound();
  const { staged, spaces } = data;
  const { planned, files, errors } = staged.counts;
  if (staged.import.status !== "review") {
    return (
      <>
        <PageHeader title="Import" subtitle={staged.import.status === "done" ? "This import is saved." : "This import was cancelled."} />
        <Link href="/settings/connections" className="underline">
          Back to Connections
        </Link>
      </>
    );
  }
  const pages = Math.ceil(planned.add / staged.pageSize);
  return (
    <>
      <PageHeader title="Review import" subtitle={`Read ${files.map((f) => f.name).join(", ")}. Nothing is saved until you import.`} />
      <Section title="What will happen">
        <ul className="grid gap-1.5">
          <li>{plural(planned.add, "new person", "new people")}, waiting for you to sort afterwards</li>
          {planned.fill ? <li>{plural(planned.fill, "person you already have gets", "people you already have get")} missing details filled in. Nothing is overwritten.</li> : null}
          {planned.unchanged ? <li>{plural(planned.unchanged, "contact is", "contacts are")} already up to date</li> : null}
          {planned.possibleDuplicates ? <li>{plural(planned.possibleDuplicates, "possible duplicate", "possible duplicates")} (same name, no shared email or phone) to review. They are never merged on their own.</li> : null}
          {planned.events ? <li>{plural(planned.events, "calendar event", "calendar events")}: past meetings become touches and events become rooms</li> : null}
        </ul>
        {errors.length ? (
          <ul className="mt-3 grid gap-1 text-small text-muted">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Save it">
        <ImportReviewActions
          importId={id}
          spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
          defaultSpaceId={staged.import.spaceId}
          label={planned.add || planned.fill || planned.events ? `Import ${plural(planned.add, "person", "people")}` : "Finish"}
        />
      </Section>

      {staged.fills.length ? (
        <Section title="Details to fill in">
          <ul className="grid gap-1 text-small">
            {staged.fills.map((f) => (
              <li key={f.personId}>
                <span className="font-[550]">{f.name}</span> <span className="text-muted">gains {f.fields.map((k) => fieldNames[k] ?? k).join(", ")}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {planned.add ? (
        <Section title={`New people${pages > 1 ? ` · page ${page + 1} of ${pages}` : ""}`}>
          <ul className="grid">
            {staged.adds.map((c, i) => (
              <li key={`${c.externalId}-${i}`} className="flex flex-wrap justify-between gap-x-3 border-b border-border py-2">
                <span className="font-[550]">{c.name}</span>
                <span className="text-small text-muted">{[c.position, c.company].filter(Boolean).join(" at ") || c.emails[0] || (c.phones[0] ? formatPhone(c.phones[0]) : "")}</span>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex gap-3 pt-3 text-small">
              {page > 0 ? <Link href={`?page=${page - 1}`}>Previous</Link> : null}
              {page + 1 < pages ? <Link href={`?page=${page + 1}`}>Next</Link> : null}
            </nav>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}

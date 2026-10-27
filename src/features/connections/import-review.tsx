import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPhone } from "@/domain/normalise";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { getStagedImport } from "@/server/import/files";
import type { CalendarSummary } from "@/server/import/calendar";
import type { ContactsSummary } from "@/server/import/contacts";
import { pendingTriageCount } from "@/server/repos/connections";
import { listSpaces } from "@/server/repos/spaces";
import { Button } from "@/ui/button";
import { ImportReviewActions } from "./import-review-actions";

const fieldNames: Record<string, string> = { emails: "email", phones: "phone", company: "company", position: "role", city: "city", birthday: "birthday", socials: "profiles", name: "name" };
const n = (x: number) => x.toLocaleString("en-GB");
const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;

/**
 * The prototype's "Review import" and "Import complete" sheets (L2305–2326, L1234–1243): what
 * the files hold and what to bring in, then what happened. Also a full page.
 */
export async function ImportReview({ id, page }: { id: string; page: number }) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await db.withUser(user.id, async (tx) => {
    const staged = await getStagedImport(tx, id, { page });
    if (!staged) return null;
    const [spaces, [profile], toSort] = await Promise.all([listSpaces(tx), tx.select({ emails: t.profiles.emails }).from(t.profiles), pendingTriageCount(tx, null)]);
    return { staged, spaces, myEmails: profile?.emails ?? [], toSort };
  });
  if (!data) notFound();
  const { staged, spaces, myEmails, toSort } = data;

  if (staged.import.status !== "review") {
    if (staged.import.status !== "done") return <p className="text-muted">This import was cancelled.</p>;
    const c = (staged.import.counts as { contacts?: ContactsSummary | null }).contacts;
    const cal = (staged.import.counts as { calendar?: CalendarSummary | null }).calendar;
    return (
      <div className="grid gap-4">
        <dl className="kv">
          {c ? (
            <>
              <dt>People added</dt>
              <dd>{n(c.added)}</dd>
              <dt>Details filled in</dt>
              <dd>{plural(c.updated, "existing person", "existing people")}</dd>
            </>
          ) : null}
          {cal ? (
            <>
              <dt>Past meetings logged</dt>
              <dd>
                {n(cal.logged)} across {plural(cal.peopleTouched, "person", "people")}
              </dd>
              <dt>Upcoming meetings</dt>
              <dd>{n(cal.rooms)} added (one-offs and series)</dd>
              <dt>Skipped</dt>
              <dd>{n(cal.skipped)} declined, cancelled, outside the window or without other guests</dd>
            </>
          ) : null}
        </dl>
        {toSort ? (
          <section className="sec" aria-label="People you haven't sorted">
            <h3>People from this import you haven&apos;t sorted</h3>
            <p className="hint">Keep the ones that matter; the meetings you had together are already logged on them.</p>
            <div>
              <Button asChild>
                <Link href="/sort">Sort {plural(toSort, "new person", "new people")}</Link>
              </Button>
            </div>
          </section>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <Link href="/settings/connections">Done</Link>
          </Button>
          {c ? (
            <Button asChild>
              <Link href="/people">See people</Link>
            </Button>
          ) : null}
          {cal ? (
            <Button asChild>
              <Link href="/rooms">See events</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const { planned, files, errors } = staged.counts;
  const pages = Math.ceil(planned.add / staged.pageSize);
  const calendars = files.filter((f) => f.events).map((f) => ({ name: f.calendar ?? f.name, events: f.events }));
  return (
    <div className="grid gap-4">
      <p className="text-[14.5px] text-muted">Read {files.map((f) => f.name).join(", ")}. Nothing is saved until you tap Import.</p>
      {errors.length ? (
        <ul className="grid gap-1 rounded-md border border-line bg-sunk p-3 text-[13.5px] text-muted">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <ImportReviewActions
        importId={id}
        spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
        defaultSpaceId={staged.import.spaceId}
        contacts={planned.found ? { found: planned.found, add: planned.add, fill: planned.fill, unchanged: planned.unchanged, nameless: planned.nameless ?? 0, duplicates: planned.possibleDuplicates } : null}
        calendars={calendars}
        myEmails={myEmails.join(", ")}
      />
      {staged.fills.length ? (
        <details className="sec">
          <summary className="cursor-pointer font-mono text-[12px] tracking-[0.08em] text-muted uppercase">Details to fill in</summary>
          <ul className="grid gap-1 pt-2 text-[14px]">
            {staged.fills.map((f) => (
              <li key={f.personId}>
                <span className="font-[550]">{f.name}</span> <span className="text-muted">gains {f.fields.map((k) => fieldNames[k] ?? k).join(", ")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {planned.add ? (
        <details className="sec" open={planned.add <= 25}>
          <summary className="cursor-pointer font-mono text-[12px] tracking-[0.08em] text-muted uppercase">
            New people{pages > 1 ? ` · page ${page + 1} of ${pages}` : ""}
          </summary>
          <ul className="grid pt-2">
            {staged.adds.map((c, i) => (
              <li key={`${c.externalId}-${i}`} className="flex flex-wrap justify-between gap-x-3 border-b border-line py-2 text-[14px]">
                <span className="font-[550]">{c.name}</span>
                <span className="text-muted">{[c.position, c.company].filter(Boolean).join(" at ") || c.emails[0] || (c.phones[0] ? formatPhone(c.phones[0]) : "")}</span>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex gap-3 pt-3 text-small">
              {page > 0 ? <Link href={`?page=${page - 1}`}>Previous</Link> : null}
              {page + 1 < pages ? <Link href={`?page=${page + 1}`}>Next</Link> : null}
            </nav>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

export async function importTitle(id: string) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return "Import";
  const [imp] = await db.withUser(user.id, (tx) => tx.select({ status: t.imports.status }).from(t.imports).where(eq(t.imports.id, id)));
  return imp?.status === "done" ? "Import complete" : "Review import";
}

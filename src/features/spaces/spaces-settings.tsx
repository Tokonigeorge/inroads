import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { cadenceLabel, researchModeLabels, spaceKindLabels, type SpaceKind } from "@/contracts/spaces";
import type { SpaceRow } from "@/server/repos/spaces";
import { Button } from "@/ui/button";
import { Section } from "@/ui/layout";
import { moveSpaceAction } from "./actions";

function describe(s: SpaceRow) {
  const people = s.people === 1 ? "1 person" : `${s.people} people`;
  return [spaceKindLabels[s.kind as SpaceKind].label, people, cadenceLabel(s.defaults.cadenceDays), researchModeLabels[s.defaults.researchMode].label].join(" · ");
}

/** Settings → Spaces: active Spaces in order (with move buttons), then archived ones. */
export function SpacesSettings({ spaces }: { spaces: SpaceRow[] }) {
  const active = spaces.filter((s) => !s.archivedAt);
  const archived = spaces.filter((s) => s.archivedAt);
  return (
    <Section
      title="Spaces"
      action={
        <Button asChild size="sm">
          <Link href="/settings/spaces/new">Add a Space</Link>
        </Button>
      }
    >
      <p id="spaces" className="pb-3 text-small text-muted">
        Each Space keeps its own notes, reminders, goals and research. A person can be in more than one.
      </p>
      <ul className="-mx-4">
        {active.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1 rounded-md pr-2 hover:bg-sunken">
            <Link href={`/settings/spaces/${s.id}`} className="grid min-h-11 min-w-0 flex-1 px-4 py-2">
              <span className="truncate font-[550]">{s.name}</span>
              <span className="truncate text-small text-muted">{describe(s)}</span>
            </Link>
            <form action={moveSpaceAction.bind(null, s.id, "up")}>
              <button type="submit" disabled={i === 0} aria-label={`Move ${s.name} up`} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-bg disabled:opacity-30">
                <ArrowUp size={16} aria-hidden />
              </button>
            </form>
            <form action={moveSpaceAction.bind(null, s.id, "down")}>
              <button type="submit" disabled={i === active.length - 1} aria-label={`Move ${s.name} down`} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-bg disabled:opacity-30">
                <ArrowDown size={16} aria-hidden />
              </button>
            </form>
          </li>
        ))}
      </ul>
      {archived.length ? (
        <>
          <h3 className="pt-5 pb-1 text-small font-[550] text-muted">Archived</h3>
          <ul className="-mx-4">
            {archived.map((s) => (
              <li key={s.id}>
                <Link href={`/settings/spaces/${s.id}`} className="grid min-h-11 rounded-md px-4 py-2 hover:bg-sunken">
                  <span className="truncate font-[550] text-muted">{s.name}</span>
                  <span className="truncate text-small text-muted">{describe(s)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}

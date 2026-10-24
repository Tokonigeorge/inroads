import type { Capture, TouchType } from "@/contracts/people";
import type { IsoDate } from "@/domain/dates";

/** What the user confirmed on the quick-capture review form. */
export type QuickReview = {
  spaceId: string;
  person:
    | { kind: "existing"; id: string; name: string }
    | {
        kind: "new";
        name: string;
        company: string;
        position: string;
        whereMet: string;
      };
  touch: { type: TouchType; occurredOn: IsoDate; summary: string } | null;
  promises: { text: string; owner: "me" | "them"; dueOn: IsoDate | null }[];
  followUpOn: IsoDate | null;
};

/**
 * The captures to send, in order: the person (if new), then the touch, then each promise. They
 * go through the offline outbox, which replays in order, so a quick capture works offline too.
 * A follow-up date becomes a promise you owe ("Follow up with Ada") so it shows on Today.
 */
export function quickCapturePlan(r: QuickReview, newId: () => string = () => crypto.randomUUID()): { personId: string; captures: Capture[] } {
  const captures: Capture[] = [];
  const personId = r.person.kind === "existing" ? r.person.id : newId();
  if (r.person.kind === "new") {
    captures.push({
      kind: "person",
      data: {
        id: personId,
        identity: {
          name: r.person.name.trim(),
          company: r.person.company,
          position: r.person.position,
        },
        membership: { spaceId: r.spaceId, whereMet: r.person.whereMet },
      },
    });
  }
  const firstName = r.person.name.trim().split(/\s+/)[0];
  const promises = [...r.promises.filter((p) => p.text.trim())];
  if (r.followUpOn)
    promises.push({
      text: `Follow up with ${firstName}`,
      owner: "me",
      dueOn: r.followUpOn,
    });
  if (r.touch) {
    captures.push({
      kind: "touch",
      data: {
        id: newId(),
        personId,
        spaceId: r.spaceId,
        occurredOn: r.touch.occurredOn,
        type: r.touch.type,
        summary: r.touch.summary,
      },
    });
  }
  for (const p of promises) {
    captures.push({
      kind: "promise",
      data: {
        id: newId(),
        personId,
        spaceId: r.spaceId,
        text: p.text.trim(),
        owner: p.owner,
        dueOn: p.dueOn,
      },
    });
  }
  return { personId, captures };
}

import { describe, expect, it } from "vitest";
import { captureSchema } from "@/contracts/people";
import { quickCapturePlan } from "./plan";

const space = "11111111-1111-4111-8111-111111111111";
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("quickCapturePlan", () => {
  it("creates a new person first, then the touch, promises and follow-up, all valid captures", () => {
    n = 0;
    const { personId, captures } = quickCapturePlan(
      {
        spaceId: space,
        person: {
          kind: "new",
          name: "Ada Obi",
          company: "Paystack",
          position: "Partnerships",
          whereMet: "",
        },
        touch: {
          type: "meeting",
          occurredOn: "2026-10-24",
          summary: "Met Ada",
        },
        promises: [
          { text: "Intro to Tola", owner: "me", dueOn: null },
          { text: "  ", owner: "me", dueOn: null },
        ],
        followUpOn: "2026-10-26",
      },
      ids,
    );
    expect(captures.map((c) => c.kind)).toEqual(["person", "touch", "promise", "promise"]);
    expect(captures.slice(1).every((c) => "personId" in c.data && c.data.personId === personId)).toBe(true);
    expect(captures[3]).toMatchObject({
      data: { text: "Follow up with Ada", owner: "me", dueOn: "2026-10-26" },
    });
    for (const c of captures) expect(captureSchema.safeParse(c).success).toBe(true);
  });

  it("reuses an existing person", () => {
    const existing = "22222222-2222-4222-8222-222222222222";
    const { personId, captures } = quickCapturePlan(
      {
        spaceId: space,
        person: { kind: "existing", id: existing, name: "Kwame" },
        touch: null,
        promises: [{ text: "Send the deck", owner: "me", dueOn: null }],
        followUpOn: null,
      },
      ids,
    );
    expect(personId).toBe(existing);
    expect(captures.map((c) => c.kind)).toEqual(["promise"]);
  });
});

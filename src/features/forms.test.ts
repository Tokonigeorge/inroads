import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrors } from "./forms";

describe("fieldErrors", () => {
  const schema = z.object({ name: z.string().min(1), note: z.string().max(5), email: z.email(), own: z.string().min(1, "Add your name."), n: z.number() });
  const errors = fieldErrors(schema.safeParse({ name: "", note: "too long", email: "nope", own: "", n: "x" }).error!);

  it("puts Zod's developer wording into plain words", () => {
    expect(errors).toEqual({
      name: "This can't be empty.",
      note: "Keep it under 5 characters.",
      email: "That doesn't look right. Check it and try again.",
      own: "Add your name.",
      n: "Check this and try again.",
    });
  });
});

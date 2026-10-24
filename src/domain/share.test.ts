import { describe, expect, it } from "vitest";
import { readShare } from "./share";

describe("readShare", () => {
  it("reads a LinkedIn profile shared from the app (title + url)", () => {
    expect(readShare({ title: "Ada Obi - Partnerships - Paystack | LinkedIn", url: "https://www.linkedin.com/in/ada-obi-4b1a2c3?utm_source=share" })).toEqual({
      kind: "profile",
      social: "linkedin",
      url: "https://www.linkedin.com/in/ada-obi-4b1a2c3",
      name: "Ada Obi",
      position: "Partnerships",
      company: "Paystack",
      note: null,
    });
  });

  it("falls back to the profile link's name when there's no title, and finds links inside text", () => {
    expect(readShare({ text: "Check out Kwame's profile https://linkedin.com/in/kwame-mensah-07." })).toMatchObject({
      kind: "profile",
      url: "https://linkedin.com/in/kwame-mensah-07",
      name: "Kwame Mensah",
      note: "Check out Kwame's profile",
    });
  });

  it("reads X and Instagram profiles but not posts", () => {
    expect(readShare({ title: "Tola Adeyemi (@tolaa) / X", url: "https://x.com/tolaa" })).toMatchObject({ kind: "profile", social: "x", name: "Tola Adeyemi" });
    expect(readShare({ url: "https://www.instagram.com/p/Cxyz123/" })).toEqual({ kind: "text", text: "https://www.instagram.com/p/Cxyz123/" });
  });

  it("treats anything else as text for quick capture", () => {
    expect(readShare({ text: "Hi! Lovely meeting you at the mixer. I'll send the deck by Friday." })).toEqual({ kind: "text", text: "Hi! Lovely meeting you at the mixer. I'll send the deck by Friday." });
    expect(readShare({ title: "Note", text: "Call Bisi tomorrow" })).toEqual({ kind: "text", text: "Note\nCall Bisi tomorrow" });
    expect(readShare({})).toEqual({ kind: "empty" });
  });
});

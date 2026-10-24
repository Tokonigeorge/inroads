import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { fromRRule, nextOccurrence, nthChoicesFor, nthWeekday, occurrences, recurrenceLabel, toRRule, type Recurrence, type Series } from "./recurrence";

/* ---------- parity with the prototype ---------- */

type ProtoEvent = { date: string; recur: string; byDays?: number[] | null; nth?: { n: number; dow: number } | null; until?: string };
type Proto = { occurrences: (e: ProtoEvent, from: string, to: string) => string[]; nthWeekday: (y: number, m: number, n: number, dow: number) => string | null };

/** Pulls the original functions out of prototype/index.html so the port is checked against them directly. */
function loadPrototype(): Proto {
  const html = readFileSync("prototype/index.html", "utf8");
  const line = (start: string) => html.split("\n").find((l) => l.startsWith(start)) ?? "";
  const block = (name: string) => {
    const startIdx = html.indexOf(`function ${name}(`);
    let depth = 0;
    for (let i = html.indexOf("{", startIdx); i < html.length; i++) {
      if (html[i] === "{") depth++;
      if (html[i] === "}" && --depth === 0) return html.slice(startIdx, i + 1);
    }
    throw new Error(name);
  };
  const src = [
    line("const pad = "),
    line("const localDate = "),
    line("const parseISO = "),
    line("const addDays = "),
    line("const diffDays = "),
    line("const isISO = "),
    block("occurrences"),
    block("nthWeekday"),
    "return { occurrences, nthWeekday };",
  ].join("\n");
  return new Function(src)() as Proto;
}

const proto = loadPrototype();
const toProto = (s: Series): ProtoEvent => ({ date: s.start, recur: s.freq, byDays: s.byDays ?? null, nth: s.nth ?? null, until: s.until ?? "" });

/** Small deterministic PRNG so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("parity with the prototype", () => {
  it("nthWeekday matches for every month, n and weekday over 3 years", () => {
    for (let y = 2025; y <= 2027; y++)
      for (let m = 0; m < 14; m++)
        for (const n of [1, 2, 3, 4, 5, -1, -2]) for (let dow = 0; dow < 7; dow++) expect(nthWeekday(y, m, n, dow)).toBe(proto.nthWeekday(y, m, n, dow));
  });

  it("occurrences match on 3,000 random series and windows", () => {
    const r = rng(42);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    const freqs = ["none", "weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;
    for (let i = 0; i < 3000; i++) {
      const start = addDays("2024-01-01", Math.floor(r() * 1200));
      const freq = pick(freqs);
      const s: Series = { start, freq };
      if ((freq === "weekly" || freq === "biweekly") && r() < 0.5) s.byDays = [...new Set([pick([0, 1, 2, 3, 4, 5, 6]), pick([0, 1, 2, 3, 4, 5, 6])])];
      if ((freq === "monthly" || freq === "quarterly") && r() < 0.5) s.nth = { n: pick([1, 2, 3, 4, 5, -1, -2]), dow: pick([0, 1, 2, 3, 4, 5, 6]) };
      if (r() < 0.3) s.until = addDays(start, Math.floor(r() * 400));
      const from = addDays(start, Math.floor(r() * 900) - 300);
      const to = addDays(from, Math.floor(r() * 400));
      expect(occurrences(s, from, to), JSON.stringify({ s, from, to })).toEqual(proto.occurrences(toProto(s), from, to));
    }
  });
});

/* ---------- behaviour ---------- */

describe("occurrences", () => {
  it("one-off events appear once, inside the window only", () => {
    expect(occurrences({ start: "2026-10-24", freq: "none" }, "2026-10-01", "2026-10-31")).toEqual(["2026-10-24"]);
    expect(occurrences({ start: "2026-10-24", freq: "none" }, "2026-10-25", "2026-10-31")).toEqual([]);
  });

  it("weekly on several days, starting mid-week", () => {
    const s: Series = { start: "2026-10-22", freq: "weekly", byDays: [1, 4] }; // Thu start, Mon + Thu
    expect(occurrences(s, "2026-10-01", "2026-11-05")).toEqual(["2026-10-22", "2026-10-26", "2026-10-29", "2026-11-02", "2026-11-05"]);
  });

  it("every two weeks, picking up mid-series", () => {
    expect(occurrences({ start: "2026-01-05", freq: "biweekly" }, "2026-10-20", "2026-11-20")).toEqual(["2026-10-26", "2026-11-09"]);
  });

  it("monthly on the 31st clamps to short months", () => {
    expect(occurrences({ start: "2026-01-31", freq: "monthly" }, "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("the 5th Friday only happens in months that have one", () => {
    expect(occurrences({ start: "2026-01-01", freq: "monthly", nth: { n: 5, dow: 5 } }, "2026-01-01", "2026-06-30")).toEqual(["2026-01-30", "2026-05-29"]);
  });

  it("last and second-to-last weekdays", () => {
    expect(occurrences({ start: "2026-01-01", freq: "monthly", nth: { n: -1, dow: 4 } }, "2026-10-01", "2026-12-31")).toEqual(["2026-10-29", "2026-11-26", "2026-12-31"]);
    expect(occurrences({ start: "2026-01-01", freq: "quarterly", nth: { n: -2, dow: 1 } }, "2026-01-01", "2026-12-31")).toEqual(["2026-01-19", "2026-04-20", "2026-07-20", "2026-10-19"]);
  });

  it("29 February repeats yearly on the 28th in other years", () => {
    expect(occurrences({ start: "2028-02-29", freq: "yearly" }, "2028-01-01", "2031-12-31")).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28"]);
  });

  it("stops at the end date, including when it falls on an occurrence", () => {
    expect(occurrences({ start: "2026-10-01", freq: "weekly", until: "2026-10-15" }, "2026-01-01", "2026-12-31")).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
  });

  it("finds the next session", () => {
    expect(nextOccurrence({ start: "2026-06-04", freq: "monthly", nth: { n: 1, dow: 4 } }, "2026-10-24")).toBe("2026-11-05");
    expect(nextOccurrence({ start: "2026-06-04", freq: "weekly", until: "2026-07-01" }, "2026-10-24")).toBeNull();
  });
});

describe("RRULE", () => {
  const cases: [Recurrence, string | null][] = [
    [{ freq: "none" }, null],
    [{ freq: "weekly" }, "FREQ=WEEKLY"],
    [{ freq: "weekly", byDays: [3, 1] }, "FREQ=WEEKLY;BYDAY=MO,WE"],
    [{ freq: "biweekly" }, "FREQ=WEEKLY;INTERVAL=2"],
    [{ freq: "monthly", nth: { n: 2, dow: 2 } }, "FREQ=MONTHLY;BYDAY=2TU"],
    [{ freq: "quarterly", nth: { n: -1, dow: 5 } }, "FREQ=MONTHLY;INTERVAL=3;BYDAY=-1FR"],
    [{ freq: "yearly" }, "FREQ=YEARLY"],
  ];
  it("round-trips our canonical rules", () => {
    for (const [rec, rule] of cases) {
      expect(toRRule(rec)).toBe(rule);
      const back = fromRRule(rule, "2026-10-26"); // a Monday
      expect(back.freq).toBe(rec.freq);
      expect(back.nth ?? null).toEqual(rec.nth ?? null);
    }
  });

  it("reads calendar-feed rules, including UNTIL, COUNT and BYSETPOS", () => {
    expect(fromRRule("RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z;BYDAY=TH", "2026-10-22")).toMatchObject({ freq: "weekly", until: "2026-12-31", unsupported: false });
    expect(fromRRule("FREQ=WEEKLY;COUNT=3", "2026-10-22").until).toBe("2026-11-05");
    expect(fromRRule("FREQ=MONTHLY;BYDAY=TH;BYSETPOS=1", "2026-10-01").nth).toEqual({ n: 1, dow: 4 });
    expect(fromRRule("FREQ=DAILY;INTERVAL=7", "2026-10-22").freq).toBe("weekly");
  });

  it("flags rules it can't represent", () => {
    expect(fromRRule("FREQ=DAILY", "2026-10-22")).toMatchObject({ freq: "none", unsupported: true });
    expect(fromRRule("FREQ=MONTHLY;INTERVAL=2", "2026-10-22").unsupported).toBe(true);
  });
});

describe("labels and choices", () => {
  it("describes repeats in plain words", () => {
    expect(recurrenceLabel({ freq: "weekly", byDays: [3, 1] })).toBe("Every week on Mon, Wed");
    expect(recurrenceLabel({ freq: "monthly", nth: { n: -1, dow: 5 } })).toBe("Every month on the last Friday");
    expect(recurrenceLabel({ freq: "none" })).toBe("Doesn't repeat");
  });
  it("offers nth-weekday choices that fit the start date", () => {
    expect(nthChoicesFor("2026-10-13")).toEqual([{ n: 2, dow: 2 }]); // 2nd Tuesday
    expect(nthChoicesFor("2026-10-27")).toEqual([{ n: 4, dow: 2 }, { n: -1, dow: 2 }]); // 4th and last Tuesday
    expect(nthChoicesFor("2026-10-30")).toEqual([{ n: -1, dow: 5 }]); // 5th Friday: only "last"
  });
});

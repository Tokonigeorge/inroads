/**
 * Made-up accounts for the brief eval, modelled on a real early user: a fintech operator in
 * Lagos with a large imported network, standing team meetings, investor and diligence calls,
 * promises in flight and a couple of goals. Deterministic (seeded), so runs are comparable.
 */

const FIRST = [
  "Kemi",
  "Tunde",
  "Adaeze",
  "Bola",
  "Chidi",
  "Ifeoma",
  "Segun",
  "Ngozi",
  "Femi",
  "Amaka",
  "Yemi",
  "Obinna",
  "Halima",
  "Dapo",
  "Zainab",
  "Kunle",
];
const LAST = [
  "Adebayo",
  "Okafor",
  "Bakare",
  "Nwosu",
  "Balogun",
  "Eze",
  "Afolabi",
  "Okoye",
  "Adeyemi",
  "Ibrahim",
  "Ogunleye",
  "Mohammed",
];
const COMPANIES = [
  "Kestrel Ventures",
  "Moniepoint",
  "Paystack",
  "Flutterwave",
  "Access Bank",
  "TLcom Capital",
  "Lagos Angel Network",
  "Meridian Telecoms",
  "Sterling Bank",
  "Partech Africa",
  "Interswitch",
  "Kuda",
];
const ROLES = [
  "Partner",
  "Head of Risk",
  "CFO",
  "Product Lead",
  "Investment Associate",
  "Founder",
  "Head of Partnerships",
  "Compliance Manager",
  "VP Engineering",
  "Analyst",
];
const MEETINGS = [
  "Diligence Africa Finances Review",
  "Weekly product standup",
  "Investor update call",
  "Pricing review with Meridian",
  "Credit committee",
  "1:1 with Kemi",
  "Partnership sync",
  "Board prep",
  "Lagos Fintech Mixer",
  "Coffee catch-up",
];
const PROMISES = [
  "Send the updated deck",
  "Intro to the Paystack partnerships team",
  "Share the diligence checklist",
  "Follow up on the term sheet questions",
  "Send last quarter's numbers",
];
const INTERESTS = [
  "running",
  "jazz",
  "climate tech",
  "Arsenal",
  "photography",
  "chess",
  "Afrobeats",
  "cooking",
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

export const SYNTHETIC_ME = `Name: Azeez (made up for the eval). Works in Work: fintech operator in Lagos, Nigeria, building a payments and credit product.
Industries: fintech, payments, lending. Offers: product and risk expertise, intros in Lagos fintech.
Goals in this Space: "Raise a seed round" (capital, high priority); "Win three enterprise clients" (clients, medium).`;

export type SyntheticCase = {
  id: string;
  kind: "daily" | "weekly";
  input: Record<string, unknown>;
  mustMention: string[];
};

export function syntheticCases(n: number, seed = 7): SyntheticCase[] {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const person = () => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    return {
      name,
      role: `${pick(ROLES)} at ${pick(COMPANIES)}`,
      lastSpoke: `${1 + Math.floor(r() * 60)} days ago`,
      interests: [pick(INTERESTS)],
      notes: r() < 0.5 ? `Met at ${pick(MEETINGS)}` : "",
    };
  };
  const out: SyntheticCase[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 3 !== 2) {
      // Daily: 0–4 meetings (some all-team, some 1:1), a few reminders.
      const meetings = Array.from({ length: Math.floor(r() * 5) }, (_, k) => {
        const people = Array.from({ length: 1 + Math.floor(r() * 3) }, person);
        const owe = r() < 0.4 ? pick(PROMISES) : null;
        return {
          time: `${9 + k * 2}:${r() < 0.5 ? "00" : "30"}`,
          title: pick(MEETINGS),
          location: r() < 0.5 ? "Google Meet" : "Lekki office",
          people: people.map((p) => ({
            ...p,
            ...(owe ? { youOwe: owe } : {}),
          })),
        };
      });
      const nudges = Array.from({ length: 2 + Math.floor(r() * 4) }, () => {
        const p = person();
        return r() < 0.5
          ? {
              kind: "due",
              title: `${p.lastSpoke.split(" ")[0]} days since you spoke with ${p.name.split(" ")[0]}`,
              detail: p.role,
            }
          : {
              kind: "promise",
              title: `You said you'd ${pick(PROMISES).toLowerCase()}`,
              detail: `For ${p.name}`,
            };
      });
      out.push({
        id: `made-up-daily-${i + 1}`,
        kind: "daily",
        input: { agenda: meetings, nudges },
        mustMention: [
          ...new Set([
            ...meetings.map((m) => m.title),
            ...meetings.flatMap((m) =>
              m.people.map((p) => p.name.split(" ")[0]),
            ),
          ]),
        ].slice(0, 10),
      });
    } else {
      const rooms = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => ({
        date: `Day ${k + 1}`,
        time: "18:00",
        title: pick(MEETINGS),
        kind: "meetup",
        people: [person().name],
      }));
      const cold = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({
        ...person(),
        daysSinceTouch: 30 + Math.floor(r() * 90),
        score: Math.floor(r() * 100),
      }));
      const goals = [
        {
          goal: "Raise a seed round",
          priority: "High",
          linked: 3 + Math.floor(r() * 8),
          thisWeek: Math.floor(r() * 4),
          target: 3,
        },
        {
          goal: "Win three enterprise clients",
          priority: "Medium",
          linked: 2 + Math.floor(r() * 5),
          thisWeek: Math.floor(r() * 3),
          target: 3,
        },
      ];
      out.push({
        id: `made-up-weekly-${i + 1}`,
        kind: "weekly",
        input: { rooms, cold, goals, openings: [], nudges: [] },
        mustMention: [
          ...new Set([
            ...rooms.map((x) => x.title),
            ...cold.map((c) => c.name.split(" ")[0]),
            "seed",
          ]),
        ].slice(0, 10),
      });
    }
  }
  return out;
}

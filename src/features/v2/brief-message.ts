/**
 * What Inroads says at the top of the Brief, built from today's data (no AI call): the one or two
 * things that matter most, in its own voice. Bold parts are names and times.
 */
export type Segment = { text: string; bold?: boolean };

export type BriefInput = {
  /** Today's meetings, soonest first: the title, the time ("18:00") if it has one, and the first person you know there. */
  meetings: { title: string; time: string | null; person: string | null }[];
  /** Promises you owe, most urgent first: who to, and whether it's overdue. */
  promises: { person: string; overdue: boolean }[];
  /** Everything else that needs you today (cooling contacts, follow-ups and so on). */
  others: number;
};

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const NUMBERS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const count = (n: number) => NUMBERS[n] ?? String(n);

export function briefMessage(input: BriefInput, timeLabel: (t: string) => string = (t) => t): Segment[] {
  const meeting = input.meetings.find((m) => m.person) ?? input.meetings[0];
  const promise = input.promises[0];
  const picks: Segment[][] = [];
  if (meeting) {
    const who = meeting.person ? first(meeting.person) : meeting.title;
    picks.push([{ text: meeting.time ? `${who} at ${timeLabel(meeting.time)}` : `${who} today`, bold: true }]);
  }
  if (promise) {
    picks.push([{ text: promise.overdue ? "the overdue promise to " : "what you promised " }, { text: first(promise.person), bold: true }]);
  }
  const total = input.meetings.length + input.promises.length + input.others;
  if (!picks.length) {
    return total
      ? [{ text: `${count(total)} ${total === 1 ? "person needs" : "people need"} a nudge today. ` }, { text: "Nothing urgent", bold: true }, { text: ", so pick one when you have a minute." }]
      : [{ text: "Nothing on your calendar and nothing owed today. " }, { text: "A good day to reach out", bold: true }, { text: " to someone you haven't spoken to in a while." }];
  }
  const lead = picks.length === 1 ? "One thing matters most today: " : "Two things matter today: ";
  const out: Segment[] = [{ text: lead }, ...picks[0]];
  if (picks[1]) out.push({ text: ", and " }, ...picks[1]);
  out.push({ text: "." });
  const rest = total - picks.length;
  if (rest > 0) out.push({ text: ` ${count(rest)} more ${rest === 1 ? "thing is" : "things are"} waiting for you.` });
  return out;
}

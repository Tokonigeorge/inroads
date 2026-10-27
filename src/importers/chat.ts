/**
 * Read an exported chat (prototype parseChat, L1829–1863): WhatsApp .txt in any of its date
 * formats, Telegram's JSON export, or anything else as plain text. Runs in the browser, so the
 * conversation only leaves the device to be read once.
 */
export type ChatMessage = { date: string; sender: string; text: string };
export type ParsedChat = { msgs: ChatMessage[]; participants: { name: string; n: number }[]; from?: string; to?: string; plain: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function finish(msgs: ChatMessage[]): ParsedChat {
  const counts = new Map<string, number>();
  for (const m of msgs) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  const participants = [...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  const dates = msgs.map((m) => m.date).filter(isIso).sort();
  return { msgs, participants, from: dates[0], to: dates.at(-1), plain: false };
}

const LINE = /^\[?(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?([^:\n]{1,80}?):\s(.*)$/;

export function parseChat(input: string): ParsedChat {
  const raw = String(input || "")
    .replace(/[‎‏‪-‮﻿]/g, "")
    .replace(/[  ]/g, " ");
  if (/^\s*\{/.test(raw)) {
    try {
      const j = JSON.parse(raw) as { messages?: { type?: string; from?: string; date?: string; text?: unknown }[] };
      const ms = (j.messages ?? []).filter((m) => m && m.type === "message" && m.from);
      if (ms.length) {
        return finish(
          ms.map((m) => ({
            date: String(m.date ?? "").slice(0, 10),
            sender: String(m.from),
            text: Array.isArray(m.text) ? m.text.map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? ""))).join("") : String(m.text ?? ""),
          })),
        );
      }
    } catch {
      // Not JSON after all: read it as text.
    }
  }
  const rows: { a: number; b: number; c: number; sender: string; text: string }[] = [];
  for (const l of raw.split(/\r?\n/)) {
    const m = LINE.exec(l);
    if (m) rows.push({ a: +m[1], b: +m[2], c: +m[3], sender: m[7].replace(/^~\s*/, "").trim(), text: m[8] });
    else if (rows.length && l.trim()) rows[rows.length - 1].text += `\n${l}`;
  }
  if (rows.length < 2) return { msgs: [], participants: [], plain: true };
  // Day-first unless a line can only be month-first (13/… is a day; …/13 is a day too).
  let dmy = true;
  if (rows.some((r) => r.a <= 12 && r.b > 12)) dmy = false;
  if (rows.some((r) => r.a > 12 && r.a <= 31)) dmy = true;
  return finish(
    rows.map((r) => {
      let y: number, mo: number, d: number;
      if (r.a > 31) [y, mo, d] = [r.a, r.b, r.c];
      else if (dmy) [d, mo, y] = [r.a, r.b, r.c];
      else [mo, d, y] = [r.a, r.b, r.c];
      if (y < 100) y += 2000;
      return { date: `${y}-${pad(mo)}-${pad(d)}`, sender: r.sender, text: r.text };
    }),
  );
}

/** The conversation as one readable transcript, "[date] sender: text" per line. */
export function chatTranscript(p: ParsedChat, raw: string) {
  return p.plain ? raw : p.msgs.map((m) => `[${m.date}] ${m.sender}: ${m.text}`).join("\n");
}

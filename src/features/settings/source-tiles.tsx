"use client";

import Link from "next/link";
import { useCapture } from "@/features/shell/capture-sheet";

const tile = "grid content-start gap-1 rounded-md border border-line bg-surface p-3.5 text-left hover:border-border-strong";

/** The prototype's "Other sources" tiles (L986–990). Files go to the import page; chats and cards open capture. */
export function SourceTiles() {
  const capture = useCapture();
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-2.5">
      <Link href="/settings/connections#files" className={tile}>
        <b>Phone or LinkedIn contacts</b>
        <span className="text-[13.5px] text-muted">iPhone or Android contacts as .vcf, Outlook CSV, or LinkedIn connections as .csv (LinkedIn: Settings → Data privacy → Get a copy of your data).</span>
      </Link>
      <Link href="/settings/connections#files" className={tile}>
        <b>Other calendars</b>
        <span className="text-[13.5px] text-muted">An .ics file or calendar link from Outlook, Apple Calendar or a single Google calendar. Past meetings are logged on the people in them; upcoming ones go into your agenda.</span>
      </Link>
      <button type="button" className={tile} onClick={() => capture.open({ mode: "chat" })}>
        <b>Chat history</b>
        <span className="text-[13.5px] text-muted">WhatsApp: open a chat → Export chat → Without media. Inroads pulls out promises, details and key moments.</span>
      </button>
      <button type="button" className={tile} onClick={() => capture.open({ mode: "card" })}>
        <b>Business card</b>
        <span className="text-[13.5px] text-muted">Snap a card and the fields fill themselves.</span>
      </button>
    </div>
  );
}

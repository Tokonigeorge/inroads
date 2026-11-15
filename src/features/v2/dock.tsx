"use client";

import { CalendarDays, Inbox, Mic, Sun, Target, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCapture } from "@/features/shell/capture-sheet";

const tabs = [
  { href: "/v2", label: "Brief", Icon: Sun },
  { href: "/v2/inbox", label: "Inbox", Icon: Inbox },
  { href: "/v2/people", label: "People", Icon: Users },
  { href: "/v2/events", label: "Events", Icon: CalendarDays },
  { href: "/v2/goals", label: "Goals", Icon: Target },
] as const;

/**
 * The bottom of every Inroads 2 screen: the one input (anything you type goes to quick capture,
 * which works out whether it's a person, a touch or a promise) and the five tabs.
 */
export function Dock() {
  const pathname = usePathname();
  const capture = useCapture();
  const [line, setLine] = useState("");
  return (
    <div className="v2-dock">
      <form
        className="ir-input"
        onSubmit={(e) => {
          e.preventDefault();
          capture.open({ line: line.trim() || undefined });
          setLine("");
        }}
      >
        <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Tell Inroads what happened…" aria-label="Tell Inroads what happened" enterKeyHint="send" />
        {/* The capture sheet has the voice note; the mic opens it there for now. */}
        <button type="button" className="ir-mic" aria-label="Record a voice note" onClick={() => capture.open({})}>
          <Mic aria-hidden />
        </button>
      </form>
      <nav className="v2-tabs" aria-label="Inroads 2">
        {tabs.map(({ href, label, Icon }) => {
          const on = href === "/v2" ? pathname === "/v2" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="v2-tab" aria-current={on ? "page" : undefined}>
              <Icon aria-hidden strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

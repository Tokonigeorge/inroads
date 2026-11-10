"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const views = [
  { week: false, href: "/today", label: "Today" },
  { week: true, href: "/today?view=week", label: "This week" },
] as const;

/**
 * Today / This week. The brief is built on the server, so switching takes a moment: the tab you
 * tap is chosen straight away instead of after the new brief arrives. Big enough to hit with a
 * thumb (44px).
 */
export function BriefToggle({ weekly }: { weekly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState(weekly);
  const on = pending ? target : weekly;
  return (
    <nav aria-label="Brief" aria-busy={pending || undefined} className="inline-flex max-w-full gap-0.5 rounded-full border border-line bg-sunk p-[3px]">
      {views.map((x) => (
        <Link
          key={x.href}
          href={x.href}
          scroll={false}
          aria-current={on === x.week ? "page" : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            if (x.week === weekly && !pending) return;
            setTarget(x.week);
            start(() => router.push(x.href, { scroll: false }));
          }}
          className={`inline-flex min-h-11 min-w-[96px] items-center justify-center rounded-full px-4 text-[14.5px] font-semibold whitespace-nowrap transition-colors ${on === x.week ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-muted hover:text-ink"}`}
        >
          {x.label}
        </Link>
      ))}
    </nav>
  );
}

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Layout for person forms inside the detail pane (desktop) or full screen (mobile). */
export function FormPage({ back, backLabel, title, children }: { back: string; backLabel: string; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 md:px-8 md:py-10">
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-small text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> {backLabel}
      </Link>
      <h1 className="pb-6 font-display text-[1.5rem] leading-[1.875rem] font-medium md:text-display">{title}</h1>
      {children}
    </div>
  );
}

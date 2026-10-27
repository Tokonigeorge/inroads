import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** A form opened from a link or a refresh, as a full page. Inside the app it opens as a sheet. */
export function FormPage({ back, backLabel, title, children }: { back: string; backLabel: string; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[620px] px-4 pt-3 pb-6">
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-small text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> {backLabel}
      </Link>
      <h1 className="pb-5 text-[26px] leading-[1.15] font-[720] tracking-[-0.02em]">{title}</h1>
      {children}
    </div>
  );
}

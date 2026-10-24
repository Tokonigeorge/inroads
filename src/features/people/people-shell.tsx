"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/ui/cn";

type Props = { list: ReactNode; children: ReactNode };

/** List on the left, detail on the right (desktop); one or the other, full screen (mobile). */
export function PeopleShell(props: Props) {
  return <PeopleShellView {...props} detailOpen={useSelectedLayoutSegment() !== null} />;
}

export function PeopleShellView({ list, children, detailOpen }: Props & { detailOpen: boolean }) {
  return (
    <div className="md:flex md:h-dvh">
      <div
        className={cn(
          "h-[calc(100dvh-56px-72px-env(safe-area-inset-bottom))] w-full shrink-0 md:h-full md:w-[380px] md:border-r md:border-border",
          detailOpen && "hidden md:block",
        )}
      >
        {list}
      </div>
      <div className={cn("min-w-0 flex-1 md:overflow-y-auto", !detailOpen && "hidden md:block")}>{children}</div>
    </div>
  );
}

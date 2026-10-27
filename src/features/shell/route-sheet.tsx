"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Sheet } from "@/ui/sheet";

const InSheet = createContext(false);

/** True inside a record or form opened as a sheet. */
export function useInSheet() {
  return useContext(InSheet);
}

/**
 * After a form saves: in a sheet, go back to the record (or show the new one in its place); on a
 * full page, load the record as a page. A soft navigation from a full-page form would open the
 * record as a sheet over the form.
 */
export function useFinishForm() {
  const router = useRouter();
  const inSheet = useInSheet();
  return (to: string, how: "back" | "replace" = "back") => {
    if (!inSheet) return window.location.assign(to);
    if (how === "replace") router.replace(to as never);
    else router.back();
  };
}

/**
 * A record or form opened over the current page (prototype pushSheet, L700): the URL changes so
 * Back closes it, and opening the same address fresh shows the full page instead.
 */
export function RouteSheet({ title, children }: { title: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <InSheet value>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (o) return;
          setOpen(false);
          router.back();
        }}
        title={title}
      >
        {children}
      </Sheet>
    </InSheet>
  );
}

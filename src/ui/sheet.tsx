"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

/**
 * The prototype's sheet (L231–242): on phones a panel rising from the bottom to just below the top,
 * from 900px a 620px panel sliding in from the right. A sticky header with the title and ×.
 */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-fade fixed inset-0 z-[60] bg-[var(--scrim)]" />
        <Dialog.Content
          className="sheet-panel fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+26px)] z-[61] overflow-y-auto overscroll-contain rounded-t-[20px] bg-bg px-4 pb-[calc(40px+env(safe-area-inset-bottom))] min-[900px]:top-0 min-[900px]:left-auto min-[900px]:w-[min(620px,100%)] min-[900px]:rounded-none"
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="sticky top-0 z-[3] flex items-center gap-2.5 bg-bg pt-3 pb-2.5">
            <Dialog.Close className="grid size-[38px] shrink-0 place-items-center rounded-full border border-line bg-surface text-ink" aria-label="Close">
              <X size={18} aria-hidden />
            </Dialog.Close>
            <Dialog.Title className="min-w-0 flex-1 truncate font-display text-[16px] leading-[1.2] font-[650]">{title}</Dialog.Title>
          </div>
          {description ? <Dialog.Description className="pb-3 text-small text-muted">{description}</Dialog.Description> : null}
          <div className="grid gap-[18px]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

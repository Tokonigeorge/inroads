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

/** Bottom sheet on mobile, centred dialog on desktop. Used for capture and short forms. */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-lg bg-surface px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-pop md:inset-auto md:top-1/2 md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6"
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 pb-4">
            <div>
              <Dialog.Title className="text-title font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-small text-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="-m-2 rounded-md p-2 text-muted hover:bg-sunken" aria-label="Close">
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

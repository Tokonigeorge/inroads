"use client";

import { useOptimistic, useState, useTransition } from "react";
import { whatsappDigits } from "@/domain/normalise";
import { logSentDraftAction } from "@/features/ai/actions";
import { useToast } from "@/ui/toast";
import { setStarredAction } from "./actions";

/** The prototype's ★ in the sheet header (L1035): priority on or off. */
export function StarToggle({ personId, starred }: { personId: string; starred: boolean }) {
  const [on, setOn] = useOptimistic(starred);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Priority"
      title="Priority"
      className={`grid size-[38px] shrink-0 place-items-center rounded-full border border-line bg-surface text-[17px] leading-none ${on ? "text-warm" : "text-faint"}`}
      onClick={() =>
        start(async () => {
          setOn(!on);
          await setStarredAction(personId, !on);
        })
      }
    >
      ★
    </button>
  );
}

/** "Copy" next to an email or phone number (prototype kvc, L1032). */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="ml-2 text-[13px] font-semibold text-accent hover:underline"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.show("Copied."))}
    >
      Copy
    </button>
  );
}

/**
 * "WhatsApp" next to a phone number: opens the chat, then offers to log it as a touch when you
 * come back, so warmth stays right without a separate step.
 */
export function WhatsAppLink({ phone, personId, spaceId, name }: { phone: string; personId: string; spaceId: string | null; name: string }) {
  const [asked, setAsked] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <>
      <a
        href={`https://wa.me/${whatsappDigits(phone)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => spaceId && setAsked(true)}
        className="ml-2 text-[13px] font-semibold text-accent hover:underline"
      >
        WhatsApp
      </a>
      {asked && spaceId ? (
        <span role="group" aria-label="Log this as a touch?" className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Messaged {first}?</span>
          <button
            type="button"
            disabled={pending}
            className="font-semibold text-accent hover:underline"
            onClick={() =>
              start(async () => {
                await logSentDraftAction(personId, spaceId, "Messaged on WhatsApp");
                setAsked(false);
                toast.show("Touch logged.");
              })
            }
          >
            Log it
          </button>
          <button type="button" className="text-muted hover:underline" onClick={() => setAsked(false)}>
            No
          </button>
        </span>
      ) : null}
    </>
  );
}

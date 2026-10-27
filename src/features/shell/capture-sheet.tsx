"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CardScan } from "@/features/ai/card-scan";
import { ChatImportForm } from "@/features/ai/chat-import";
import { QuickCapture } from "@/features/capture/quick-capture";
import { AddPromiseForm, LogTouchForm, type PickedPerson } from "@/features/people/capture-forms";
import { PersonPicker } from "@/features/people/person-picker";
import { QuickAddPerson, useSpaces } from "@/features/people/quick-add-person";
import { Sheet } from "@/ui/sheet";
import { useShortcut } from "@/ui/use-shortcut";

type Mode = "menu" | "person" | "touch" | "promise" | "card" | "chat";
type OpenArgs = { mode?: Mode; person?: PickedPerson; spaceId?: string; line?: string };
const CaptureContext = createContext<{ open: (args?: OpenArgs) => void } | null>(null);

export function useCapture() {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used inside CaptureProvider");
  return ctx;
}

const titles: Record<Mode, string> = { menu: "Capture", person: "Add a person", touch: "Log a touch", promise: "Add a promise", card: "Scan a business card", chat: "Import a chat" };


/** One capture sheet for the whole app: the mobile + button, the `c` key and person pages open it. */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: Mode; person?: PickedPerson; spaceId?: string; line?: string; key: number }>({ open: false, mode: "menu", key: 0 });
  const open = useCallback((args: OpenArgs = {}) => setState((s) => ({ open: true, mode: args.mode ?? "menu", person: args.person, spaceId: args.spaceId, line: args.line, key: s.key + 1 })), []);
  const close = () => setState((s) => ({ ...s, open: false }));
  useShortcut("c", () => open());
  const api = useMemo(() => ({ open }), [open]);
  const { data: spaces } = useSpaces();
  const spaceId = state.spaceId ?? spaces?.selectedId ?? undefined;
  const title = state.mode === "touch" && state.person ? `Log a touch with ${state.person.name.split(/\s+/)[0]}` : titles[state.mode];

  return (
    <CaptureContext value={api}>
      {children}
      <Sheet open={state.open} onOpenChange={(o) => (o ? null : close())} title={title}>
        {state.mode !== "menu" && !state.person ? (
          <button type="button" onClick={() => setState((s) => ({ ...s, mode: "menu" }))} className="-mt-2 mb-3 flex items-center gap-1 text-small text-muted hover:text-text">
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
        ) : null}
        {state.mode === "menu" ? (
          <QuickCapture
            key={state.key}
            initialLine={state.line}
            onDone={close}
            below={
              <div className="grid gap-1 border-t border-border pt-4">
                <p className="px-3 pb-1 text-small text-muted">Or add one thing</p>
                <ul className="grid gap-1">
                  {(["person", "touch", "promise"] as const).map((m) => (
                    <li key={m}>
                      <button type="button" onClick={() => setState((s) => ({ ...s, mode: m }))} className="flex min-h-11 w-full items-center rounded-md px-3 text-left font-[550] hover:bg-sunken">
                        {titles[m]}
                      </button>
                    </li>
                  ))}
                  <li>
                    <Link href="/rooms/new" onClick={close} className="flex min-h-11 w-full items-center rounded-md px-3 text-left font-[550] hover:bg-sunken">
                      Add event
                    </Link>
                  </li>
                  {(["card", "chat"] as const).map((m) => (
                    <li key={m}>
                      <button type="button" onClick={() => setState((s) => ({ ...s, mode: m }))} className="flex min-h-11 w-full items-center rounded-md px-3 text-left font-[550] hover:bg-sunken">
                        {titles[m]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            }
          />
        ) : state.mode === "person" ? (
          <QuickAddPerson onDone={close} />
        ) : state.mode === "card" ? (
          <CardScan onDone={close} aiEnabled={Boolean(spaces?.aiEnabled)} />
        ) : state.mode === "chat" && !spaces?.aiEnabled ? (
          <p className="text-small text-muted">Reading chats needs AI, which isn&apos;t set up on this server yet.</p>
        ) : !state.person ? (
          <PersonPicker spaceId={spaceId} onPick={(person) => setState((s) => ({ ...s, person }))} />
        ) : state.mode === "chat" ? (
          <ChatImportForm personId={state.person.id} spaces={state.person.spaces} myName="" onDone={close} />
        ) : state.mode === "touch" ? (
          <LogTouchForm person={state.person} defaultSpaceId={spaceId} onDone={close} />
        ) : (
          <AddPromiseForm person={state.person} defaultSpaceId={spaceId} onDone={close} />
        )}
      </Sheet>
    </CaptureContext>
  );
}

"use client";

import { ArrowLeft } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AddPromiseForm, LogTouchForm, type PickedPerson } from "@/features/people/capture-forms";
import { PersonPicker } from "@/features/people/person-picker";
import { QuickAddPerson, useSpaces } from "@/features/people/quick-add-person";
import { Sheet } from "@/ui/sheet";
import { useShortcut } from "@/ui/use-shortcut";

type Mode = "menu" | "person" | "touch" | "promise";
type OpenArgs = { mode?: Mode; person?: PickedPerson; spaceId?: string };
const CaptureContext = createContext<{ open: (args?: OpenArgs) => void } | null>(null);

export function useCapture() {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used inside CaptureProvider");
  return ctx;
}

const titles: Record<Mode, string> = { menu: "Capture", person: "Add a person", touch: "Log a touch", promise: "Add a promise" };

// Wired to their flows as each milestone lands: rooms (M4), card scan and chat import (M9).
const later = [
  { label: "Add a room", when: "Rooms" },
  { label: "Scan a business card", when: "AI features" },
  { label: "Import a chat", when: "AI features" },
];

/** One capture sheet for the whole app: the mobile + button, the `c` key and person pages open it. */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: Mode; person?: PickedPerson; spaceId?: string }>({ open: false, mode: "menu" });
  const open = useCallback((args: OpenArgs = {}) => setState({ open: true, mode: args.mode ?? "menu", person: args.person, spaceId: args.spaceId }), []);
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
          <ul className="grid gap-1">
            {(["person", "touch", "promise"] as const).map((m) => (
              <li key={m}>
                <button type="button" onClick={() => setState((s) => ({ ...s, mode: m }))} className="flex min-h-11 w-full items-center rounded-md px-3 text-left font-[550] hover:bg-sunken">
                  {titles[m]}
                </button>
              </li>
            ))}
            {later.map((a) => (
              <li key={a.label}>
                <button type="button" disabled className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-muted">
                  <span className="font-[550]">{a.label}</span>
                  <span className="text-small text-faint">Arrives with {a.when}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : state.mode === "person" ? (
          <QuickAddPerson onDone={close} />
        ) : !state.person ? (
          <PersonPicker spaceId={spaceId} onPick={(person) => setState((s) => ({ ...s, person }))} />
        ) : state.mode === "touch" ? (
          <LogTouchForm person={state.person} defaultSpaceId={spaceId} onDone={close} />
        ) : (
          <AddPromiseForm person={state.person} defaultSpaceId={spaceId} onDone={close} />
        )}
      </Sheet>
    </CaptureContext>
  );
}

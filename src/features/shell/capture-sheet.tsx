"use client";

import { Sheet } from "@/ui/sheet";

// Each action gets wired to its flow in the milestone that builds it (People: M3, Rooms: M4, AI: M9).
const actions = [
  { label: "Add a person", when: "People" },
  { label: "Log a touch", when: "People" },
  { label: "Add a promise", when: "People" },
  { label: "Add a room", when: "Rooms" },
  { label: "Scan a business card", when: "AI features" },
  { label: "Import a chat", when: "AI features" },
];

export function CaptureSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Capture">
      <ul className="grid gap-1">
        {actions.map((a) => (
          <li key={a.label}>
            <button type="button" disabled className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left disabled:text-muted">
              <span className="font-[550]">{a.label}</span>
              <span className="text-small text-faint">Arrives with {a.when}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

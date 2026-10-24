"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useSpaces } from "@/features/people/quick-add-person";
import { selectSpaceAction } from "@/features/spaces/actions";
import { cn } from "@/ui/cn";
import { Sheet } from "@/ui/sheet";
import { isTyping } from "@/ui/use-shortcut";
import { useCapture } from "./capture-sheet";

type Item = { id: string; group: string; label: string; hint?: string; keywords?: string; run: () => void };
type SearchResult = { people: { id: string; name: string; detail: string }[]; rooms: { id: string; title: string }[]; goals: { id: string; text: string }[] };

const PaletteContext = createContext<{ open: () => void; openHelp: () => void } | null>(null);
export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used inside CommandPaletteProvider");
  return ctx;
}

const goKeys: Record<string, string> = { t: "/today", p: "/people", r: "/rooms", g: "/goals", s: "/settings" };

export const shortcutHelp: { keys: string; what: string }[] = [
  { keys: "⌘K or Ctrl K", what: "Search and run commands" },
  { keys: "c", what: "Capture: add a person, log a touch, add a promise" },
  { keys: "/", what: "Search the list you're on" },
  { keys: "j / k", what: "Next or previous person in the list" },
  { keys: "l", what: "Log a touch with this person" },
  { keys: "e", what: "Edit what you're looking at" },
  { keys: "a", what: "Add people to this goal" },
  { keys: "[ / ]", what: "Move the focused person a stage back or forward" },
  { keys: "1 2 3", what: "Sort: priority, keep, not now" },
  { keys: "g then t, p, r, g, s", what: "Go to Today, People, Rooms, Goals, Settings" },
  { keys: "?", what: "Show these shortcuts" },
];

async function search(q: string): Promise<SearchResult> {
  const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("search");
  return res.json();
}

const matches = (item: Item, q: string) => {
  if (!q) return true;
  const hay = `${item.label} ${item.keywords ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
};

/** ⌘K palette, `g` go-to sequences and `?` help, for the whole app. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const router = useRouter();
  const api = useMemo(() => ({ open: () => setOpen(true), openHelp: () => setHelp(true) }), []);

  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      if (pendingG && Date.now() - pendingG < 1200 && goKeys[e.key]) {
        e.preventDefault();
        pendingG = 0;
        router.push(goKeys[e.key]);
        return;
      }
      pendingG = e.key === "g" ? Date.now() : 0;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <PaletteContext value={api}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-2 top-2 z-50 overflow-hidden rounded-lg bg-surface shadow-pop md:inset-x-auto md:top-[12vh] md:left-1/2 md:w-[560px] md:-translate-x-1/2"
          >
            <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
            {open ? <Palette close={() => setOpen(false)} showHelp={() => setHelp(true)} /> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Sheet open={help} onOpenChange={setHelp} title="Keyboard shortcuts">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-small">
          {shortcutHelp.map((s) => (
            <div key={s.keys} className="contents">
              <dt>
                <kbd className="rounded-sm border border-border bg-sunken px-1.5 py-0.5 font-mono text-micro">{s.keys}</kbd>
              </dt>
              <dd className="text-muted">{s.what}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </PaletteContext>
  );
}

function Palette({ close, showHelp }: { close: () => void; showHelp: () => void }) {
  const router = useRouter();
  const capture = useCapture();
  const { data: spaces } = useSpaces();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(q.trim());
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const { data: found, isFetching } = useQuery({ queryKey: ["search", deferred], queryFn: () => search(deferred), enabled: deferred.length > 0, staleTime: 10_000 });

  const go = useCallback(
    (href: string) => () => {
      close();
      router.push(href);
    },
    [close, router],
  );
  const statics: Item[] = useMemo(() => {
    const later = (fn: () => void) => () => {
      close();
      // Let the palette close before another dialog opens.
      setTimeout(fn, 0);
    };
    const list: Item[] = [
      { id: "add-person", group: "Actions", label: "Add a person", run: later(() => capture.open({ mode: "person" })), keywords: "new contact" },
      { id: "log-touch", group: "Actions", label: "Log a touch", run: later(() => capture.open({ mode: "touch" })), keywords: "met call coffee" },
      { id: "add-promise", group: "Actions", label: "Add a promise", run: later(() => capture.open({ mode: "promise" })), keywords: "owe commitment" },
      { id: "add-room", group: "Actions", label: "Add a room", run: go("/rooms/new"), keywords: "event meeting" },
      { id: "add-goal", group: "Actions", label: "Add a goal", run: go("/goals/new") },
      { id: "sort", group: "Actions", label: "Sort new people", run: go("/people/triage"), keywords: "triage import" },
      { id: "connections", group: "Actions", label: "Connect Google, Outlook or a calendar", run: go("/settings/connections"), keywords: "import sync" },
      { id: "help", group: "Actions", label: "Show keyboard shortcuts", run: later(showHelp), hint: "?" },
      { id: "go-today", group: "Go to", label: "Today", run: go("/today"), hint: "g t" },
      { id: "go-people", group: "Go to", label: "People", run: go("/people"), hint: "g p" },
      { id: "go-rooms", group: "Go to", label: "Rooms", run: go("/rooms"), hint: "g r" },
      { id: "go-goals", group: "Go to", label: "Goals", run: go("/goals"), hint: "g g" },
      { id: "go-settings", group: "Go to", label: "Settings", run: go("/settings"), hint: "g s" },
      { id: "profile", group: "Actions", label: "Edit your profile", run: go("/settings/profile"), keywords: "time zone brief name" },
      { id: "export", group: "Actions", label: "Export your data", run: go("/settings#export"), keywords: "download backup csv json" },
    ];
    if (spaces && spaces.spaces.length > 1) {
      const pick = (id: string | "all") => () => {
        close();
        void selectSpaceAction(id);
      };
      list.push({ id: "space-all", group: "Spaces", label: "Show all Spaces", run: pick("all"), keywords: "switch" });
      for (const s of spaces.spaces) list.push({ id: `space-${s.id}`, group: "Spaces", label: `Show ${s.name}`, run: pick(s.id), keywords: "switch space" });
    }
    return list;
  }, [capture, close, go, showHelp, spaces]);

  const items: Item[] = useMemo(() => {
    const dynamic: Item[] =
      deferred && found
        ? [
            ...found.people.map((p) => ({ id: `p-${p.id}`, group: "People", label: p.name, hint: p.detail, run: go(`/people/${p.id}`) })),
            ...found.rooms.map((r) => ({ id: `r-${r.id}`, group: "Rooms", label: r.title, run: go(`/rooms/${r.id}`) })),
            ...found.goals.map((g) => ({ id: `g-${g.id}`, group: "Goals", label: g.text, run: go(`/goals/${g.id}`) })),
          ]
        : [];
    return [...dynamic, ...statics.filter((i) => matches(i, deferred))];
  }, [deferred, found, go, statics]);

  const current = Math.min(active, Math.max(0, items.length - 1));
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[current]?.run();
    }
  };

  let lastGroup = "";
  return (
    <div className="grid">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search size={16} className="shrink-0 text-muted" aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[current] ? `${listId}-${items[current].id}` : undefined}
          aria-label="Search people, rooms, goals and commands"
          placeholder="Search people, rooms, goals, or type a command"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full bg-transparent text-[16px] outline-none md:text-body"
          autoComplete="off"
        />
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-label="Results" aria-busy={isFetching} className="max-h-[60dvh] overflow-y-auto p-1 md:max-h-[50vh]">
        {items.map((item, i) => {
          const heading = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <li key={item.id} role="presentation">
              {heading ? (
                <div role="presentation" className="px-2.5 pt-2 pb-1 text-micro font-[550] text-muted">
                  {heading}
                </div>
              ) : null}
              <div
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={i === current}
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => item.run()}
                className={cn("flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5", i === current ? "bg-sunken" : "")}
              >
                <span className="truncate">{item.label}</span>
                {item.hint ? <span className="shrink-0 truncate text-small text-muted">{item.hint}</span> : null}
              </div>
            </li>
          );
        })}
        {!items.length ? <li className="px-2.5 py-3 text-small text-muted">{isFetching ? "Searching…" : `Nothing matches "${deferred}".`}</li> : null}
      </ul>
    </div>
  );
}

/** Sidebar and mobile header button for the palette. */
export function PaletteButton({ compact }: { compact?: boolean }) {
  const { open } = usePalette();
  if (compact) {
    return (
      <button type="button" onClick={open} aria-label="Search" className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-sunken">
        <Search size={20} strokeWidth={1.75} aria-hidden />
      </button>
    );
  }
  return (
    <button type="button" onClick={open} className="flex h-9 w-full items-center gap-2.5 rounded-md border border-border px-2.5 text-muted hover:bg-sunken hover:text-text">
      <Search size={16} strokeWidth={1.75} aria-hidden />
      <span className="flex-1 text-left">Search</span>
      <kbd className="font-mono text-micro">⌘K</kbd>
    </button>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { strengthLabel } from "@/domain/relationship";

// The graph draws on a canvas in the browser only.
const ForceGraph = dynamic(() => import("./graph-canvas"), { ssr: false }) as unknown as React.ComponentType<Record<string, unknown>>;

export type MapNode = { id: string; name: string; company: string | null; starred: boolean; strength: number | null; goalId: string | null };
export type MapEdge = { a: string; b: string; why: "knows" | "company" | "event" };
export type MapGoalInfo = { id: string; text: string };

/** Goal colours first, then company clusters; bright enough on both themes. */
const GOAL_COLOURS = ["#7c8cff", "#3fc28a", "#f0a33c", "#e0628c", "#4fb3e8", "#b07cf0"];
const CLUSTER_COLOURS = ["#5fb8a8", "#d98b5f", "#8fa3d9", "#c9a04a", "#a37fc4", "#6aa86a", "#d9739a", "#5f9fd9"];
// Lines get their own colours, apart from the goal colours on the dots.
const LINK_COLOURS: Record<MapEdge["why"], string> = { knows: "#f5f0e6", company: "#d4b483", event: "#8f9bbf" };
const LINK_LABELS: Record<MapEdge["why"], string> = { knows: "Know each other", company: "Same company", event: "At the same event" };
const YOU = "__you__";

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type GNode = MapNode & { x?: number; y?: number; fx?: number; fy?: number; colour: string; r: number; you?: boolean };
type GLink = { source: string | GNode; target: string | GNode; why: MapEdge["why"] | "you"; strength: number | null };

/**
 * The network map as a live graph: you in the middle, a line to everyone you know (thicker means
 * more contact logged), and lines between people who know each other, work together or were at
 * the same event, so clusters form on their own. Colour is the goal they're on, else their
 * company. Drag, pinch or scroll to move and zoom; tap someone to open them.
 */
export function NetworkMap({ people, links, goals }: { people: MapNode[]; links: MapEdge[]; goals: MapGoalInfo[] }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const graph = useRef<{ zoomToFit: (ms?: number, pad?: number) => void; d3Force: (name: string) => { distance?: (fn: (l: GLink) => number) => void; strength?: (n: number) => void } | undefined } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = size.width;
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [ink, setInk] = useState({ text: "#e8ebf3", bg: "#0d1017", accent: "#8a99ff", faint: "#6e7589" });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    const css = getComputedStyle(document.documentElement);
    const v = (k: string, d: string) => css.getPropertyValue(k).trim() || d;
    setInk({ text: v("--ink", "#e8ebf3"), bg: v("--bg", "#0d1017"), accent: v("--accent", "#8a99ff"), faint: v("--faint", "#6e7589") });
    return () => ro.disconnect();
  }, []);

  const goalColour = useMemo(() => new Map(goals.map((g, i) => [g.id, GOAL_COLOURS[i % GOAL_COLOURS.length]])), [goals]);
  const data = useMemo(() => {
    const nodes: GNode[] = [
      { id: YOU, name: "You", company: null, starred: false, strength: 100, goalId: null, colour: ink.accent, r: 9, you: true, fx: 0, fy: 0 },
      ...people.map((p) => ({
        ...p,
        colour: p.goalId && goalColour.has(p.goalId) ? goalColour.get(p.goalId)! : p.company ? CLUSTER_COLOURS[hash(p.company.trim().toLowerCase()) % CLUSTER_COLOURS.length] : ink.faint,
        r: 3 + (p.strength ?? 0) / 18 + (p.starred ? 1.5 : 0),
      })),
    ];
    const ls: GLink[] = [...people.map((p) => ({ source: YOU, target: p.id, why: "you" as const, strength: p.strength })), ...links.map((l) => ({ source: l.a, target: l.b, why: l.why, strength: null }))];
    return { nodes, links: ls };
  }, [people, links, goalColour, ink]);

  // Stronger relationships pull closer to you; links between people are short, so clusters form.
  useEffect(() => {
    const g = graph.current;
    if (!g) return;
    g.d3Force("link")?.distance?.((l: GLink) => (l.why === "you" ? 50 + (100 - (l.strength ?? 0)) * 1.4 : 30));
    g.d3Force("charge")?.strength?.(-40);
  }, [data, width]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (!m.has(l.a)) m.set(l.a, new Set());
      if (!m.has(l.b)) m.set(l.b, new Set());
      m.get(l.a)!.add(l.b);
      m.get(l.b)!.add(l.a);
    }
    return m;
  }, [links]);
  const labelled = useMemo(() => new Set([...people].sort((a, b) => Number(b.starred) - Number(a.starred) || (b.strength ?? -1) - (a.strength ?? -1)).slice(0, 10).map((p) => p.id)), [people]);
  const lit = (id: string) => {
    if (filter && id !== YOU && people.find((p) => p.id === id)?.goalId !== filter) return false;
    if (!hover || hover === YOU) return true;
    return id === hover || id === YOU || Boolean(neighbours.get(hover)?.has(id));
  };
  const endId = (n: string | GNode) => (typeof n === "string" ? n : n.id);
  const whys = [...new Set(links.map((l) => l.why))];

  return (
    <div className="grid gap-3">
      {goals.length ? (
        <div role="group" aria-label="Show people on" className="flex flex-wrap gap-1.5">
          <Chip pressed={filter == null} onClick={() => setFilter(null)}>
            Everyone
          </Chip>
          {goals.map((g) => (
            <Chip key={g.id} pressed={filter === g.id} onClick={() => setFilter(filter === g.id ? null : g.id)} swatch={goalColour.get(g.id)}>
              {g.text}
            </Chip>
          ))}
        </div>
      ) : null}

      <div ref={box} role="group" aria-label={`Network map, ${people.length} people`} className="relative h-[min(70vh,620px)] w-full overflow-hidden rounded-xl border border-line bg-[var(--bg)]">
        {width ? (
          <ForceGraph
            graphRef={graph}
            width={width}
            height={size.height || 560}
            graphData={data}
            backgroundColor="rgba(0,0,0,0)"
            cooldownTicks={180}
            onEngineStop={() => graph.current?.zoomToFit(600, 40)}
            nodeRelSize={1}
            nodeVal={(n: GNode) => n.r * n.r}
            nodeLabel={(n: GNode) => (n.you ? "" : `${n.name}${n.company ? ` · ${n.company}` : ""} — ${n.strength == null ? "no contact logged yet" : `${strengthLabel(n.strength).toLowerCase()} (${n.strength}/100)`}`)}
            linkColor={(l: GLink) => {
              const on = lit(endId(l.source)) && lit(endId(l.target));
              if (l.why === "you") return on ? `rgba(138,153,255,${0.12 + (l.strength ?? 0) / 160})` : "rgba(138,153,255,0.04)";
              return on ? LINK_COLOURS[l.why] : "rgba(128,128,128,0.08)";
            }}
            linkWidth={(l: GLink) => (l.why === "you" ? 0.4 + (l.strength ?? 0) / 35 : 1.4)}
            linkLineDash={(l: GLink) => (l.why === "you" && l.strength == null ? [2, 3] : null)}
            onNodeHover={(n: GNode | null) => setHover(n?.id ?? null)}
            onNodeClick={(n: GNode) => !n.you && router.push(`/people/${n.id}` as never)}
            nodeCanvasObject={(n: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
              const on = lit(n.id);
              ctx.globalAlpha = on ? 1 : 0.15;
              if (n.starred) {
                ctx.beginPath();
                ctx.arc(n.x!, n.y!, n.r + 3, 0, 2 * Math.PI);
                ctx.fillStyle = `${n.colour}55`;
                ctx.fill();
              }
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, n.r, 0, 2 * Math.PI);
              ctx.fillStyle = n.colour;
              ctx.fill();
              ctx.lineWidth = 1 / scale;
              ctx.strokeStyle = ink.bg;
              ctx.stroke();
              // Names: always for you and the closest few, for everyone once you zoom in, and on hover.
              if (n.you || labelled.has(n.id) || scale > 2.2 || hover === n.id) {
                const size = (n.you ? 13 : 11) / scale;
                ctx.font = `${n.you ? 700 : 550} ${size}px system-ui, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                const label = n.you ? "You" : n.name.split(/\s+/)[0];
                ctx.lineWidth = 3 / scale;
                ctx.strokeStyle = ink.bg;
                ctx.strokeText(label, n.x!, n.y! + n.r + 2 / scale);
                ctx.fillStyle = ink.text;
                ctx.fillText(label, n.x!, n.y! + n.r + 2 / scale);
              }
              ctx.globalAlpha = 1;
            }}
            nodePointerAreaPaint={(n: GNode, colour: string, ctx: CanvasRenderingContext2D) => {
              ctx.fillStyle = colour;
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, n.r + 4, 0, 2 * Math.PI);
              ctx.fill();
            }}
          />
        ) : null}
        <p className="pointer-events-none absolute bottom-2 left-3 text-[12px] text-muted">Drag to move · pinch or scroll to zoom · tap someone to open</p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-small text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-[3px] w-5 rounded bg-accent" /> To you: thicker means more contact logged
        </span>
        {whys.map((w) => (
          <span key={w} className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-[2px] w-5 rounded" style={{ background: LINK_COLOURS[w] }} /> {LINK_LABELS[w]}
          </span>
        ))}
      </div>

      {/* The same people as a list, for keyboards and screen readers. */}
      <details className="text-small">
        <summary className="cursor-pointer text-muted hover:text-text">See them as a list</summary>
        <ul aria-label="People on the map" className="mt-2 grid gap-1 sm:grid-cols-2">
          {[...people]
            .sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1))
            .map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`} className="hover:underline">
                  {p.name}: {p.strength == null ? "no contact logged yet" : `${strengthLabel(p.strength).toLowerCase()} (${p.strength}/100)`}
                </Link>
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}

function Chip({ pressed, onClick, swatch, children }: { pressed: boolean; onClick: () => void; swatch?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13.5px] ${pressed ? "border-accent bg-accent-soft font-semibold" : "border-line bg-surface hover:bg-sunk"}`}
    >
      {swatch ? <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: swatch }} /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

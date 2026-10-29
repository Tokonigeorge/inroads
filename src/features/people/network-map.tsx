"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { radiusFor, unit, type MapGoal, type PlacedPerson } from "@/domain/network-map";
import { strengthLabel } from "@/domain/relationship";

/** One colour per goal, in goal order; people on no goal are grey. */
const PALETTE = ["var(--accent)", "var(--good)", "var(--warm)", "var(--fresh)", "var(--hot)", "var(--cool)"];
const NO_GOAL = "var(--cold)";

const RINGS = [
  { at: 70, label: "Strong" },
  { at: 40, label: "Good" },
  { at: 20, label: "Fading" },
];

/**
 * The network map: you in the middle, your people around you. Closer is a stronger relationship,
 * colour is the goal they're on, a glow means starred. Dots fly out from you when the map opens
 * and drift gently; tap one to open the person. Filter by goal to see who matters for it.
 */
export function NetworkMap({ people, goals }: { people: PlacedPerson[]; goals: MapGoal[] }) {
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | "none" | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const colour = new Map(goals.map((g, i) => [g.id, PALETTE[i % PALETTE.length]]));
  const goalText = new Map(goals.map((g) => [g.id, g.text]));
  const colourOf = (p: PlacedPerson) => (p.goalId && colour.has(p.goalId) ? colour.get(p.goalId)! : NO_GOAL);
  const inFilter = (p: PlacedPerson) => filter == null || (filter === "none" ? !p.goalId || !colour.has(p.goalId) : p.goalId === filter);
  const hasNoGoal = people.some((p) => !p.goalId || !colour.has(p.goalId));
  const focus = people.find((p) => p.id === active);

  return (
    <div className="grid gap-4">
      {goals.length ? (
        <div role="group" aria-label="Show people on" className="flex flex-wrap gap-1.5">
          <Chip pressed={filter == null} onClick={() => setFilter(null)}>
            Everyone
          </Chip>
          {goals.map((g) => (
            <Chip key={g.id} pressed={filter === g.id} onClick={() => setFilter(filter === g.id ? null : g.id)} swatch={colour.get(g.id)}>
              {g.text}
            </Chip>
          ))}
          {hasNoGoal ? (
            <Chip pressed={filter === "none"} onClick={() => setFilter(filter === "none" ? null : "none")} swatch={NO_GOAL}>
              On no goal
            </Chip>
          ) : null}
        </div>
      ) : null}

      <div className="relative mx-auto aspect-square w-full max-w-[640px]">
        <svg viewBox="-1.1 -1.1 2.2 2.2" className="size-full overflow-visible" role="group" aria-label={`Network map, ${people.length} people`}>
          <defs>
            <radialGradient id="map-you" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {RINGS.map((ring) => (
            <g key={ring.at} aria-hidden>
              <circle r={radiusFor(ring.at)} fill="none" stroke="var(--line)" strokeWidth={0.004} strokeDasharray="0.012 0.012" />
              <text y={-radiusFor(ring.at) - 0.015} textAnchor="middle" fontSize={0.035} fill="var(--faint)" className="font-mono uppercase">
                {ring.label}
              </text>
            </g>
          ))}
          <circle r={0.3} fill="url(#map-you)" aria-hidden className="map-breathe" />
          <circle r={0.07} fill="var(--accent)" aria-hidden />
          <text y={0.016} textAnchor="middle" fontSize={0.045} fontWeight={700} fill="var(--accent-ink)" aria-hidden>
            You
          </text>

          {people.map((p, i) => {
            const c = colourOf(p);
            const dim = !inFilter(p);
            const faded = p.strength == null || p.strength < 20;
            const size = p.starred ? 0.034 : 0.024;
            const label = `${p.name}: ${p.strength == null ? "no touches yet" : `${strengthLabel(p.strength).toLowerCase()} (${p.strength}/100)`}${p.goalId && goalText.has(p.goalId) ? `, on ${goalText.get(p.goalId)}` : ""}${p.starred ? ", starred" : ""}`;
            return (
              <a
                key={p.id}
                href={`/people/${p.id}`}
                aria-label={label}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(`/people/${p.id}` as never);
                }}
                onMouseEnter={() => setActive(p.id)}
                onMouseLeave={() => setActive((a) => (a === p.id ? null : a))}
                onFocus={() => setActive(p.id)}
                onBlur={() => setActive((a) => (a === p.id ? null : a))}
                className="outline-none"
                style={{
                  transform: shown ? `translate(${p.x}px, ${p.y}px)` : "translate(0px, 0px) scale(0)",
                  transition: `transform 1100ms cubic-bezier(.2,.8,.2,1) ${Math.min(i * 9, 900)}ms, opacity 300ms`,
                  opacity: dim ? 0.12 : faded ? 0.6 : 1,
                }}
              >
                <g
                  className="map-drift"
                  style={{
                    ["--dx" as string]: `${(unit(p.id) - 0.5) * 0.03}px`,
                    ["--dy" as string]: `${(unit(p.id + "y") - 0.5) * 0.03}px`,
                    animationDuration: `${5 + unit(p.id + "t") * 5}s`,
                    animationDelay: `${-unit(p.id + "d") * 5}s`,
                  }}
                >
                  {p.starred ? <circle r={size * 2} fill={c} opacity={0.25} className="map-glow" /> : null}
                  <circle r={0.045} fill="transparent" />
                  <circle r={active === p.id ? size * 1.5 : size} fill={c} stroke="var(--surface)" strokeWidth={0.006} style={{ transition: "r 150ms" }} />
                </g>
              </a>
            );
          })}

          {focus ? (
            <g aria-hidden style={{ pointerEvents: "none" }}>
              <text
                x={focus.x}
                y={focus.y - 0.06}
                textAnchor="middle"
                fontSize={0.05}
                fontWeight={650}
                fill="var(--ink)"
                stroke="var(--bg)"
                strokeWidth={0.014}
                paintOrder="stroke"
              >
                {focus.name}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <p className="text-center text-small text-muted">Closer to you means a stronger relationship. Colour is the goal they&apos;re on; a glow means starred. Tap someone to open them.</p>
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

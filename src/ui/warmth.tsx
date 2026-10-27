import type { Warmth } from "@/domain/relationship";
import { cn } from "./cn";

/** A 6px dot plus a text label. Colour is never the only signal (DESIGN_SYSTEM §2.1). */
export function WarmthDot({ warmth, className }: { warmth: Warmth; className?: string }) {
  if (warmth.key === "none") return null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        warmth.key === "recent" && "bg-accent",
        warmth.key === "warm" && "bg-accent/55",
        warmth.key === "cooling" && "bg-faint",
        warmth.key === "cold" && "border border-border-strong",
        className,
      )}
    />
  );
}

/** The prototype's warmth bands (L864) and their ring colours. */
export const warmthBands = {
  recent: { label: "Hot", color: "var(--hot)", span: "2 weeks" },
  warm: { label: "Warm", color: "var(--warm)", span: "6 weeks" },
  cooling: { label: "Cooling", color: "var(--cool)", span: "3 months" },
  cold: { label: "Cold", color: "var(--cold)", span: null },
  none: { label: "No touches yet", color: "var(--fresh)", span: null },
} as const;

/** "Warm · 23d" as a tag with its colour dot (prototype .tag.w-*). */
export function WarmthTag({ warmth }: { warmth: Warmth }) {
  const b = warmthBands[warmth.key];
  return (
    <span className="tag" style={{ ["--ring" as string]: b.color }}>
      <i aria-hidden />
      {b.label}
      {warmth.days != null ? ` · ${warmth.days}d` : ""}
    </span>
  );
}

/** Hot · 2 weeks / Warm · 6 weeks / Cooling · 3 months / Cold / No touches yet. */
export function WarmthLegend() {
  return (
    <p className="legend" aria-label="Warmth">
      {Object.entries(warmthBands).map(([k, b]) => (
        <span key={k} style={{ ["--ring" as string]: b.color }}>
          <i aria-hidden />
          {b.label}
          {b.span ? ` · ${b.span}` : ""}
        </span>
      ))}
    </p>
  );
}

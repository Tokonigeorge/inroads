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

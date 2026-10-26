import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

type ListRowProps = {
  href?: string;
  leading?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  className?: string;
};

/** Primary line, muted secondary line, trailing metadata. 44px minimum touch target. */
export function ListRow({ href, leading, primary, secondary, trailing, selected, className }: ListRowProps) {
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-[550]">{primary}</span>
        {secondary ? <span className="truncate text-small text-muted">{secondary}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-small text-muted">{trailing}</span> : null}
    </>
  );
  const cls = cn(
    "flex min-h-11 items-center gap-3 rounded-md px-4 py-3 md:min-h-9 md:py-2",
    selected ? "bg-accent-soft" : href && "hover:bg-sunken",
    className,
  );
  return href ? (
    <Link href={href} className={cls} aria-current={selected ? "page" : undefined}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The ring colour for each warmth band (prototype .w-*): hot, warm, cooling, cold, no touches yet. */
const ring = { recent: "var(--hot)", warm: "var(--warm)", cooling: "var(--cool)", cold: "var(--cold)", none: "var(--fresh)" } as const;
export type WarmthKey = keyof typeof ring;

/** Initials in a circle; with `warmth`, ringed in that band's colour like the prototype's avatars. */
export function Avatar({ name, size = 32, warmth }: { name: string; size?: 24 | 32 | 40 | 42 | 64; warmth?: WarmthKey }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-sunk font-display font-[650] text-ink ${warmth ? "ring-warmth m-1" : ""}`}
      style={{ width: size, height: size, fontSize: size <= 24 ? 10 : size <= 32 ? 12 : size <= 42 ? 14 : 22, ["--ring" as string]: warmth ? ring[warmth] : undefined }}
    >
      {initials}
    </span>
  );
}

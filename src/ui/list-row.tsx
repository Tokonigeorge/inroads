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

/** A hue for a name: the same person always gets the same tint. */
export function hueOf(name: string) {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function Avatar({ name, size = 32 }: { name: string; size?: 24 | 32 | 40 }) {
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
      className="avatar-tint inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size <= 24 ? 10 : size === 32 ? 12 : 14, ["--h" as string]: hueOf(name) }}
    >
      {initials}
    </span>
  );
}

import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A page's hero (prototype .hero, L88): a mono uppercase stamp, the big display title, a muted
 * lede, then the page's actions in a row.
 */
export function PageHeader({ title, subtitle, actions, stamp }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; stamp?: ReactNode }) {
  return (
    <header className="grid gap-2.5 pt-[18px] pb-3.5">
      {stamp ? <p className="stamp">{stamp}</p> : null}
      <h1>{title}</h1>
      {subtitle ? <p className="lede">{subtitle}</p> : null}
      {actions ? <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div> : null}
    </header>
  );
}

/** A block (prototype .block, L90): an h2 with an optional mono count pill, an action on the right. */
export function Section({
  title,
  action,
  count,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  count?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("grid content-start gap-3 pt-[22px] pb-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5">
          {title}
          {count !== undefined && count !== null ? <span className="count">{count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Nothing here yet (prototype .empty, L83): a dashed box with what will appear, and how to start. */
export function EmptyState({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed border-line bg-sunk p-3.5 text-[14.5px] text-muted">
      {icon ? (
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col items-start gap-3">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "./cn";

/** Page header: display-face title, optional line beneath, actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium tracking-[-0.01em] md:text-display">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-small text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A section is a heading and content separated by space, not a box. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("pb-8", className)}>
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-title font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One sentence that teaches the next action, plus one button. No illustration. */
/** Nothing here yet: what will appear, and how to start. An icon makes the bigger ones friendlier. */
export function EmptyState({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={icon ? "rise flex items-start gap-4 rounded-lg border border-dashed border-border p-4" : "flex flex-col items-start gap-3 py-2"}>
      {icon ? (
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted">{children}</p>
        {action}
      </div>
    </div>
  );
}

/** Desktop detail container with a sticky header; a full page on mobile. */
export function Pane({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-none md:px-8">{header}</div>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}

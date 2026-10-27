import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";

/* Prototype inputs (L121–124): 44px, 11px radius, hairline border, accent focus ring. */
const control =
  "w-full rounded-md border border-line bg-surface px-3 text-[16px] leading-[1.35] text-ink " +
  "focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-[color-mix(in_srgb,var(--accent)_55%,transparent)] " +
  "aria-[invalid=true]:border-bad disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[84px] py-2.5", className)} {...props} />;
}

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  /** Receives the ids to wire onto the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
};

/** Label above, hint or error below, linked with aria-describedby. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-small text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-small text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-11 pr-9 pl-3", className)} {...props} />;
}

/** Radio buttons styled as a compact segmented row (used for small fixed choices). */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  legend,
  hideLegend = false,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  legend: string;
  hideLegend?: boolean;
}) {
  return (
    <fieldset>
      <legend className={hideLegend ? "sr-only" : "pb-1.5 text-[13px] font-semibold text-muted"}>{legend}</legend>
      {/* The prototype's .seg: a sunk pill track, the chosen option raised on a white pill. */}
      <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full border border-line bg-sunk p-[3px]">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-full px-3.5 py-[7px] text-[13.5px] font-semibold text-muted has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgb(0_0_0/0.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

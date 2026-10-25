import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-sm border border-border-strong bg-surface px-3 text-[16px] text-text md:text-body " +
  "aria-[invalid=true]:border-danger disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...props} />;
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
      <label htmlFor={id} className="text-small font-[550] text-text">
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
  return <select className={cn(control, "h-10 pr-9 pl-3", className)} {...props} />;
}

/** Radio buttons styled as a compact segmented row (used for small fixed choices). */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  legend,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="pb-1.5 text-small font-[550]">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-md border border-border px-3 py-2 text-small font-[550] text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

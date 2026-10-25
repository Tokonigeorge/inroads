/** A thin bar showing how far along something is. The text beside it carries the meaning. */
export function Meter({ value, max, label, valueText }: { value: number; max: number; label: string; valueText: string }) {
  const pct = Math.round(Math.min(1, value / Math.max(1, max)) * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"
    >
      <div className="grow h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The week's target is met: a small badge that pops in once. */
export function TargetHit() {
  return (
    <span className="pop inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-micro font-semibold text-on-accent">
      <span aria-hidden>✓</span> Week done
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/**
 * The last few weeks against the weekly target: one thin bar per week (this week last), a dashed
 * target line, and the count on hover or focus (and as each bar's name for screen readers).
 */
export function WeekTrend({ weeks, target }: { weeks: { start: string; done: number }[]; target: number }) {
  const max = Math.max(target, ...weeks.map((w) => w.done), 1);
  const H = 64;
  const met = weeks.filter((w) => w.done >= target).length;
  const label = (w: { start: string; done: number }, i: number) => `${i === weeks.length - 1 ? "This week" : `Week of ${short(w.start)}`}: ${w.done} of ${target}`;
  return (
    <figure className="grid gap-1.5">
      <figcaption className="flex items-baseline justify-between gap-3 text-small text-muted">
        <span>Last {weeks.length} weeks</span>
        {/* Only once there's something to count: a new goal shouldn't open on "0 of 8". */}
        {met ? (
          <span>
            Target met {met} of {weeks.length}
          </span>
        ) : null}
      </figcaption>
      <div className="relative" style={{ height: H }}>
        <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-border-strong" style={{ bottom: (target / max) * H }}>
          <span className="absolute -top-[9px] right-0 bg-surface pl-1 text-[11px] leading-none text-muted">target {target}</span>
        </div>
        <ul aria-label={`Touches a week, target ${target}`} className="absolute inset-0 flex items-end gap-[2px]">
          {weeks.map((w, i) => (
            <li key={w.start} className="group relative flex h-full flex-1 items-end justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-accent" tabIndex={0} aria-label={label(w, i)}>
              <span aria-hidden className="block w-full max-w-[22px] rounded-t-[4px] bg-accent" style={{ height: w.done ? Math.max(3, (w.done / max) * H) : 2, opacity: w.done ? 1 : 0.25 }} />
              <span aria-hidden className="pointer-events-none absolute -top-7 z-10 hidden rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] whitespace-nowrap text-text shadow-pop group-hover:block group-focus:block">
                {label(w, i)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-between text-[11px] text-muted" aria-hidden>
        <span>{short(weeks[0].start)}</span>
        <span>This week</span>
      </div>
    </figure>
  );
}

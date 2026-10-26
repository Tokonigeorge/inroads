/** Two converging roads. The only decorative mark in the app. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={size >= 24 ? 2.6 : 2.2} strokeLinecap="round" aria-hidden className="shrink-0 text-accent">
      <path d="M5 28C9 20 12.5 13 16 5" />
      <path d="M27 28C23 20 19.5 13 16 5" />
      <path d="M11 28c1.5-4 3-7 5-10M21 28c-1.5-4-3-7-5-10" strokeWidth="1.6" opacity=".45" />
    </svg>
  );
}

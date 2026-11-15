/**
 * A small painted landscape (hills, a warm cloud, a sun) in the theme's watercolour pigments.
 * The paint filter wobbles the edges like a brush. `id` must be unique on the page.
 */
export function Scene({ id, backdrop = false }: { id: string; backdrop?: boolean }) {
  const f = `ir-paint-${id}`;
  if (backdrop) {
    return (
      <svg className="ir-scene ir-scene--backdrop" viewBox="0 0 360 120" aria-hidden="true">
        <defs>
          <filter id={f} x="-5%" y="-10%" width="110%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={9} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={12} />
            <feGaussianBlur stdDeviation="0.9" />
          </filter>
        </defs>
        <g filter={`url(#${f})`}>
          <circle className="sun" cx="292" cy="44" r="18" />
          <path className="far rise" d="M-10 74 C60 46 120 54 180 66 C240 78 290 48 370 58 L370 130 L-10 130Z" />
          <path className="mid rise" d="M-10 92 C50 76 110 76 170 88 C230 100 290 80 370 86 L370 130 L-10 130Z" />
          <path className="near rise" d="M-10 108 C70 98 130 102 190 108 C250 114 310 100 370 104 L370 130 L-10 130Z" />
        </g>
      </svg>
    );
  }
  return (
    <svg className="ir-scene" viewBox="0 0 360 150" aria-hidden="true">
      <defs>
        <filter id={f} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={3} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={10} />
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
      </defs>
      <g filter={`url(#${f})`}>
        <ellipse className="warm" cx="90" cy="40" rx="110" ry="40" opacity=".7" />
        <circle className="sun" cx="262" cy="58" r="22" />
        <path className="far rise" d="M-10 104 C50 74 100 80 150 94 C205 110 255 72 370 88 L370 160 L-10 160Z" />
        <path className="mid rise" d="M-10 122 C40 104 95 102 150 116 C210 132 270 104 370 114 L370 160 L-10 160Z" />
        <path className="near rise" d="M-10 138 C60 126 120 130 180 138 C240 146 300 128 370 134 L370 160 L-10 160Z" />
      </g>
    </svg>
  );
}

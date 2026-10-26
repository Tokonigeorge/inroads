import type { ReactNode } from "react";

/** Standard page container: one 960px column for every tab (prototype main#view, L64). */
export function PageFrame({ children }: { children: ReactNode; wide?: boolean }) {
  return <div className="mx-auto w-full max-w-[960px] px-4 pt-1 pb-6">{children}</div>;
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-busy="true" aria-label="Loading">
      <div className="shimmer h-10 w-64 rounded-md" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="shimmer h-16 rounded-lg" />
      ))}
    </div>
  );
}

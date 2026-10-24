import type { ReactNode } from "react";

/** Standard page container. Pages put their signed-in content inside <Suspense>. */
export function PageFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full px-4 py-6 md:px-8 md:py-10 ${wide ? "max-w-[1100px]" : "max-w-[760px]"}`}>{children}</div>;
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-md bg-sunken" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-11 rounded-md bg-sunken" />
      ))}
    </div>
  );
}

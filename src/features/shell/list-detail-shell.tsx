import { Suspense, type ReactNode } from "react";
import { DetailMarker } from "./detail-marker";

/**
 * List on the left, detail on the right (desktop); one or the other, full screen (mobile).
 * Used by People and Rooms. A small marker in the layout (not in the pages, which Next keeps
 * mounted after navigation) says whether a detail page is open; CSS does the rest, so the
 * pages themselves are only rendered once.
 */
export function ListDetailShell({ list, children }: { list: ReactNode; children: ReactNode }) {
  return (
    <div className="group/ld md:flex md:h-dvh">
      <Suspense fallback={null}>
        <DetailMarker />
      </Suspense>
      <div className="h-[calc(100dvh-56px-72px-env(safe-area-inset-bottom))] w-full shrink-0 group-has-[[data-ld-detail]]/ld:hidden md:block! md:h-full md:w-[380px] md:border-r md:border-border">
        {list}
      </div>
      <div className="hidden min-w-0 flex-1 group-has-[[data-ld-detail]]/ld:block md:block md:overflow-y-auto">{children}</div>
    </div>
  );
}

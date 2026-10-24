"use client";

import { useSelectedLayoutSegment } from "next/navigation";

/** Renders an empty marker while a detail page (anything below the index) is open. */
export function DetailMarker() {
  return useSelectedLayoutSegment() !== null ? <span data-ld-detail hidden /> : null;
}

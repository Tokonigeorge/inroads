"use client";

import { Plus } from "lucide-react";
import { useSpaces } from "@/features/people/quick-add-person";
import { useCapture } from "./capture-sheet";

/** Quick capture (log a touch, add someone, a promise) from anywhere: a small + in the brand bar. */
export function CaptureButton() {
  const capture = useCapture();
  // Load (and keep on the device) the Spaces list now, so capture still works if you go offline.
  useSpaces();
  return (
    <button
      type="button"
      onClick={() => capture.open()}
      aria-label="Capture"
      className="flex size-10 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-hover"
    >
      <Plus size={20} aria-hidden />
    </button>
  );
}

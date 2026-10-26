"use client";

import { Plus } from "lucide-react";
import { useCapture } from "./capture-sheet";

/** Quick capture (log a touch, add someone, a promise) from anywhere: a small + in the brand bar. */
export function CaptureButton() {
  const capture = useCapture();
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

import type { Metadata } from "next";

export const metadata: Metadata = { title: "People" };

/** Desktop only: the detail pane before anyone is chosen. On mobile the list fills the screen. */
export default function PeopleIndex() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="max-w-[320px] text-center text-muted">Choose someone to see what you know about them, or press c to capture something new.</p>
    </div>
  );
}

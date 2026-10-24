import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rooms" };

/** Desktop only: the detail pane before a room is chosen. */
export default function RoomsIndex() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="max-w-[320px] text-center text-muted">Rooms are the meetings and events you go to. Choose one to see who&apos;ll be there and how often you go.</p>
    </div>
  );
}

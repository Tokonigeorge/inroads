import type { Metadata } from "next";
import { AppProviders } from "@/features/shell/app-providers";
import { Dock } from "@/features/v2/dock";
import "@/features/v2/v2.css";
import "@/features/v2/shell.css";

export const metadata: Metadata = { title: { default: "Inroads 2", template: "%s · Inroads 2" } };

/**
 * Inroads 2 (DECISIONS #215): the new interface, built alongside the current app on the same data.
 * Its styles live under `.v2` so nothing here changes the current app.
 */
export default function V2Layout({ children }: LayoutProps<"/v2">) {
  return (
    <AppProviders>
      <div className="v2 ir">
        {children}
        <Dock />
      </div>
    </AppProviders>
  );
}

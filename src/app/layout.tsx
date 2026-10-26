import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { ServiceWorker } from "@/features/pwa/service-worker";
import "./globals.css";

// The prototype's three faces: Bricolage Grotesque for headings, Geist for text, Geist Mono for stamps and numbers.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"], display: "swap", axes: ["opsz"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin", "latin-ext"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Inroads", template: "%s · Inroads" },
  description: "Keep track of the people who matter to your goals, the rooms you're in and what you've promised.",
  applicationName: "Inroads",
  appleWebApp: { capable: true, title: "Inroads", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edeff5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1017" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${bricolage.variable} ${geist.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

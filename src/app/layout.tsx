import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { ServiceWorker } from "@/features/pwa/service-worker";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], display: "swap" });
// Display face for page titles only, one weight.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: "500",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Inroads", template: "%s · Inroads" },
  description: "Keep track of the people who matter to your goals, the rooms you're in and what you've promised.",
  applicationName: "Inroads",
  appleWebApp: { capable: true, title: "Inroads", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${newsreader.variable} h-full`}>
      <body className="min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

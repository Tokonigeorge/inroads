import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inroads",
    short_name: "Inroads",
    description: "Keep track of the people who matter to your goals, the rooms you're in and what you've promised.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f7",
    theme_color: "#faf9f7",
    // Share into Inroads from other apps: profile links, messages, contact cards (app/share/route.ts).
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "files", accept: ["text/vcard", "text/x-vcard", ".vcf", "text/calendar", ".ics"] }],
      },
    } as unknown as MetadataRoute.Manifest["share_target"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

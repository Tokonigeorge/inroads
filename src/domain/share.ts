/**
 * Reading what someone shared into Inroads from another app (the PWA share target): a profile
 * link (LinkedIn, X, Instagram, …) becomes "add this person", anything else is text for quick
 * capture. Pure, so it's easy to test against what real apps send.
 */
import { urlsToSocials } from "@/importers/common";

export type SharedInput = { title?: string | null; text?: string | null; url?: string | null };
export type SocialKey = "linkedin" | "x" | "instagram" | "tiktok" | "github" | "substack" | "website";
export type ShareRead =
  | { kind: "profile"; social: SocialKey; url: string; name: string | null; position: string | null; company: string | null; note: string | null }
  | { kind: "text"; text: string }
  | { kind: "empty" };

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const PROFILE: Partial<Record<SocialKey, RegExp>> = {
  linkedin: /linkedin\.com\/in\/([^/?#\s]+)/i,
  x: /(?:twitter|x)\.com\/(?!home|search|i\/|intent)([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i,
  instagram: /instagram\.com\/(?!p\/|reel\/|stories\/)([A-Za-z0-9_.]{1,30})(?:[/?#]|$)/i,
  tiktok: /tiktok\.com\/@([A-Za-z0-9_.]{1,30})(?:[/?#]|$)/i,
  github: /github\.com\/([A-Za-z0-9-]{1,39})\/?(?:[?#]|$)/i,
};

const cleanUrl = (u: string) => u.replace(/[).,;!?]+$/, "");
const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** "ada-obi-4b1a2c3" → "Ada Obi"; numbers and LinkedIn's hex suffixes are dropped. */
function nameFromSlug(slug: string): string | null {
  const words = decodeURIComponent(slug)
    .split(/[-_.]+/)
    .filter((w) => w && !/\d/.test(w) && !/^[0-9a-f]{6,}$/i.test(w));
  return words.length >= 1 && words.length <= 4 ? titleCase(words.join(" ").toLowerCase()) : null;
}

/** "Ada Obi - Partnerships - Paystack | LinkedIn" → name, role, company. */
function fromTitle(title: string) {
  const t = title.replace(/\s*[|·]\s*(LinkedIn|X|Twitter|Instagram|TikTok|GitHub).*$/i, "").replace(/\s+on (LinkedIn|X|Instagram).*$/i, "").trim();
  const handle = /^(.+?)\s*\(@[\w.]+\)/.exec(t);
  if (handle) return { name: handle[1].trim(), position: null, company: null };
  const parts = t.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts[0].length > 80) return { name: null, position: null, company: null };
  return { name: parts[0], position: parts.length >= 3 ? parts[1] : null, company: parts.length >= 3 ? parts[2] : parts.length === 2 ? parts[1] : null };
}

export function readShare(input: SharedInput): ShareRead {
  const title = (input.title ?? "").trim().slice(0, 300);
  const text = (input.text ?? "").trim().slice(0, 4000);
  const urls = [input.url ?? "", ...(text.match(URL_RE) ?? [])].map((u) => cleanUrl(u.trim())).filter(Boolean);

  for (const url of urls) {
    for (const [key, re] of Object.entries(PROFILE) as [SocialKey, RegExp][]) {
      const m = re.exec(url);
      if (!m) continue;
      const social = (Object.keys(urlsToSocials([url]))[0] as SocialKey | undefined) ?? key;
      const t = fromTitle(title);
      const rest = text.replace(URL_RE, "").trim();
      return {
        kind: "profile",
        social,
        url: url.split(/[?#]/)[0],
        name: t.name ?? (key === "linkedin" ? nameFromSlug(m[1]) : null),
        position: t.position,
        company: t.company,
        note: rest && rest !== title ? rest.slice(0, 500) : null,
      };
    }
  }
  const body = [title && !text.includes(title) ? title : "", text || (input.url ?? "")].filter(Boolean).join("\n").trim();
  return body ? { kind: "text", text: body } : { kind: "empty" };
}

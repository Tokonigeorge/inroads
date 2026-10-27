/**
 * A saved social handle or link as a URL, as the prototype's socialUrl() (L602) builds it.
 * Full URLs pass through; bare domains get https://; handles map to each network's profile URL.
 * Returns "" when there's nothing to link to.
 */
export function socialUrl(key: string, value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "");
  if (key === "website" || /^[\w.-]+\.(com|org|net|io|co|ng|dev|app|me|xyz|ai)(\/|$)/i.test(v)) return `https://${v.replace(/^\/+/, "")}`;
  const map: Record<string, string> = {
    linkedin: `https://www.linkedin.com/in/${h}`,
    x: `https://x.com/${h}`,
    instagram: `https://instagram.com/${h}`,
    tiktok: `https://www.tiktok.com/@${h}`,
    github: `https://github.com/${h}`,
    substack: `https://${h}.substack.com`,
  };
  return map[key] ?? "";
}

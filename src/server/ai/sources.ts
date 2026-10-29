/** Sources: the pages the model saw (web tool results) plus the ones it says it used. */
export type Source = { title: string; url: string };

const isHttp = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u);

export function cleanSources(list: unknown, cap = 12): Source[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of list) {
    const url = (s as { url?: unknown })?.url;
    if (!isHttp(url)) continue;
    const key = url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = String((s as { title?: unknown }).title ?? "").trim().slice(0, 200);
    out.push({ title: title || new URL(url).hostname, url });
    if (out.length >= cap) break;
  }
  return out;
}

/** Sources the model cited first, then the pages its searches returned. */
export function mergeSources(cited: unknown, seen: Source[], cap = 12) {
  return cleanSources([...(Array.isArray(cited) ? cited : []), ...seen], cap);
}

/**
 * A search, browse or category page rather than one event's own page (Eventbrite's /d/…/music-networking,
 * Meetup's /find, anything with ?q=). Linking those as "the listing" sends people somewhere unrelated.
 */
export function isSearchPage(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname.toLowerCase();
  if (/(^|\.)eventbrite\.[a-z.]+$/.test(host) && /^\/(d|b|cc)\//.test(path)) return true;
  if (/(^|\.)meetup\.com$/.test(host) && /^\/find\b/.test(path)) return true;
  if (/(^|\/)(search|find|discover|explore)(\/|$)/.test(path)) return true;
  if (["q", "query", "keywords", "search", "k"].some((k) => u.searchParams.has(k))) return true;
  return /search/i.test(u.hash);
}

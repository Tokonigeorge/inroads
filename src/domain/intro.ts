/**
 * The double-opt-in ask: you ask the connector whether the other person would welcome an intro,
 * rather than asking them to introduce you outright. Plain, short, easy to say no to.
 */
export function introAsk(c: { connector: string; target: string; targetDetail: string; goal: string | null }) {
  const first = (n: string) => n.trim().split(/\s+/)[0] || n;
  const who = c.targetDetail ? `${c.target} (${c.targetDetail})` : c.target;
  const why = c.goal ? ` I'm working on "${c.goal}" and I think ${first(c.target)} would be a great person to talk to.` : "";
  return `Hi ${first(c.connector)}, hope you're well! I'd love to meet ${who}.${why} Would you be open to asking if they'd be happy to be introduced? I can send a short note you can forward. No pressure at all if it's not a good fit.`;
}

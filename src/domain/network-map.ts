/**
 * Where each person sits on the network map: you in the middle, people around you. Closer means a
 * stronger relationship (the same 0–100 strength as the person's page); people with no touches yet
 * sit on the edge. Each goal gets its own slice of the circle, so a goal's people cluster together.
 * Pure and deterministic: the same people always land in the same place.
 */

export type MapPerson = { id: string; name: string; strength: number | null; starred: boolean; goalId: string | null };
export type MapGoal = { id: string; text: string };
export type PlacedPerson = MapPerson & { x: number; y: number; r: number };

/** Radius for a strength: 100 sits near you (0.2), 0 near the edge (0.9); no touches at all, 0.97. */
export function radiusFor(strength: number | null) {
  if (strength == null) return 0.97;
  const s = Math.max(0, Math.min(100, strength));
  return 0.2 + 0.7 * (1 - s / 100);
}

/** A stable number in [0, 1) from an id, for small offsets that stop dots sitting on each other. */
export function unit(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Slices of the circle in goal order (people with no goal last), each sized by how many people it
 * holds, with a floor so a small goal still gets room. Inside a slice people spread evenly, the
 * strongest first, with a small id-based nudge in and out.
 */
export function layoutNetwork(people: MapPerson[], goals: MapGoal[]): PlacedPerson[] {
  if (!people.length) return [];
  const known = new Set(goals.map((g) => g.id));
  const groups = [...goals.map((g) => g.id), null]
    .map((goalId) => ({ goalId, members: people.filter((p) => (p.goalId && known.has(p.goalId) ? p.goalId : null) === goalId) }))
    .filter((g) => g.members.length);
  const floor = 0.08;
  const weights = groups.map((g) => Math.max(floor, g.members.length / people.length));
  const total = weights.reduce((a, b) => a + b, 0);
  const out: PlacedPerson[] = [];
  let start = -Math.PI / 2;
  groups.forEach((g, gi) => {
    const span = (2 * Math.PI * weights[gi]) / total;
    const members = [...g.members].sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1) || a.name.localeCompare(b.name));
    members.forEach((p, i) => {
      const angle = start + span * ((i + 0.5) / members.length);
      const r = Math.min(0.99, radiusFor(p.strength) + (unit(p.id) - 0.5) * 0.08);
      out.push({ ...p, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
    start += span;
  });
  return out;
}

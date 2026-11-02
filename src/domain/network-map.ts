/** The network map's people and goals (the graph itself is laid out live in the browser). */
export type MapPerson = { id: string; name: string; strength: number | null; starred: boolean; goalId: string | null };
export type MapGoal = { id: string; text: string };

/** Shapes and blank values for person forms. Plain module: safe to use on the server and the client. */
export type SpaceOption = { id: string; name: string; defaultCadenceDays: number | null; circles: { id: string; name: string; defaultCadenceDays: number | null }[] };

export type Identity = {
  name: string;
  emails: string[];
  phones: string[];
  company: string | null;
  position: string | null;
  city: string | null;
  birthday: string | null;
  socials: Record<string, string>;
};
export type MembershipValues = {
  spaceId: string;
  whereMet: string | null;
  metOn: string | null;
  interests: string[];
  notes: string | null;
  opportunities: string | null;
  tags: string[];
  circleId: string | null;
  cadenceDays: number | null;
  starred: boolean;
};

export const emptyIdentity: Identity = { name: "", emails: [], phones: [], company: null, position: null, city: null, birthday: null, socials: {} };
export const emptyMembership = (spaceId: string): MembershipValues => ({
  spaceId,
  whereMet: null,
  metOn: null,
  interests: [],
  notes: null,
  opportunities: null,
  tags: [],
  circleId: null,
  cadenceDays: null,
  starred: false,
});


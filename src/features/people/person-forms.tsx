"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { socialKeys, socialLabels, type MembershipInput, type PersonIdentityInput } from "@/contracts/people";
import { cadenceChoices, cadenceLabel } from "@/contracts/spaces";
import type { FormState } from "@/features/forms";
import { sendCapture } from "@/features/offline/outbox";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { saveMembershipAction, updateIdentityAction } from "./actions";
import { useFinishForm } from "@/features/shell/route-sheet";
import { useAfterCapture } from "./capture-forms";
import { emptyIdentity, emptyMembership, type Identity, type MembershipValues, type SpaceOption } from "./person-defaults";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ErrorText({ id, children }: { id?: string; children?: string }) {
  return children ? (
    <p id={id} role="alert" className="text-small text-danger">
      {children}
    </p>
  ) : null;
}

/** Repeating text inputs ("Add another email"). */
function ListInputs({
  label,
  name,
  values,
  type,
  error,
  inputMode,
  placeholder,
}: {
  label: string;
  name: string;
  values: string[];
  type: string;
  error?: string;
  inputMode?: "email" | "tel";
  placeholder?: string;
}) {
  const [rows, setRows] = useState(values.length ? values : [""]);
  return (
    <fieldset className="grid gap-1.5">
      <legend className="pb-1.5 text-small font-[550]">{label}</legend>
      {rows.map((v, i) => (
        <Input
          key={i}
          name={name}
          type={type}
          inputMode={inputMode}
          defaultValue={v}
          aria-label={`${label} ${i + 1}`}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          placeholder={i === 0 ? placeholder : undefined}
        />
      ))}
      {rows.length < 10 ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setRows((r) => [...r, ""])}>
            + another {label.toLowerCase()}
          </Button>
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </fieldset>
  );
}

function BirthdayField({ birthday, error }: { birthday: string | null; error?: string }) {
  const [bMonth, bDay] = birthday ? birthday.split("-") : ["", ""];
  return (
    <fieldset className="grid gap-1.5">
      <legend className="pb-1.5 text-small font-[550]">Birthday</legend>
      <div className="flex gap-2">
        <Select name="bMonth" defaultValue={bMonth} aria-label="Birthday month" className="w-auto">
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </Select>
        <Select name="bDay" defaultValue={bDay} aria-label="Birthday day" className="w-auto">
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </Select>
      </div>
      <ErrorText>{error}</ErrorText>
    </fieldset>
  );
}

function ProfileFields({ socials }: { socials: Record<string, string> }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="pb-1.5 text-small font-[550]">Profiles</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {socialKeys.map((k) => (
          <Field key={k} label={socialLabels[k]}>
            {({ id }) => <Input id={id} name={`s_${k}`} defaultValue={socials[k] ?? ""} maxLength={200} placeholder={k === "website" ? "example.com" : "Handle or link"} autoComplete="off" />}
          </Field>
        ))}
      </div>
    </fieldset>
  );
}

function IdentityFields({ v, errors }: { v: Identity; errors: Record<string, string> }) {
  return (
    <div className="grid gap-5">
      <Field label="Name" error={errors.name}>
        {({ id, describedBy, invalid }) => <Input id={id} name="name" defaultValue={v.name} required maxLength={120} autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Position" error={errors.position}>
          {({ id }) => <Input id={id} name="position" defaultValue={v.position ?? ""} maxLength={120} placeholder="Role or title" autoComplete="off" />}
        </Field>
        <Field label="Company" error={errors.company}>
          {({ id }) => <Input id={id} name="company" defaultValue={v.company ?? ""} maxLength={120} autoComplete="off" />}
        </Field>
      </div>
      <Field label="City" error={errors.city}>
        {({ id }) => <Input id={id} name="city" defaultValue={v.city ?? ""} maxLength={120} placeholder="Lagos" autoComplete="off" />}
      </Field>
      <ListInputs label="Phone" name="phones" values={v.phones} type="tel" inputMode="tel" error={errors.phones} />
      <ListInputs label="Email" name="emails" values={v.emails} type="email" inputMode="email" error={errors.emails} />
      <BirthdayField birthday={v.birthday} error={errors.birthday} />
      <ProfileFields socials={v.socials} />
    </div>
  );
}

/**
 * The prototype's "Add person" sheet (L1084–1107), field for field: who they are, where you met,
 * what you know, profiles, priority. Space, circle and reminder sit in a fold.
 */
function NewPersonFields({ v, m, spaces, errors, today }: { v: Identity; m: MembershipValues; spaces: SpaceOption[]; errors: Record<string, string>; today: string }) {
  const [spaceId, setSpaceId] = useState(m.spaceId);
  const space = spaces.find((s) => s.id === spaceId);
  const [circleId, setCircleId] = useState(m.circleId ?? "");
  const circle = space?.circles.find((c) => c.id === circleId);
  const inherited = circle?.defaultCadenceDays ?? space?.defaultCadenceDays ?? null;
  const known = cadenceChoices.filter((c) => c.days !== null);
  const moreOpen = Boolean(errors.spaceId || errors.circleId || errors.cadenceDays);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => <Input id={id} name="name" defaultValue={v.name} required maxLength={120} placeholder="Full name" autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid} />}
        </Field>
        <ListInputs label="Email" name="emails" values={v.emails} type="email" inputMode="email" error={errors.emails} placeholder="name@company.com" />
        <Field label="Company" error={errors.company}>
          {({ id }) => <Input id={id} name="company" defaultValue={v.company ?? ""} maxLength={120} autoComplete="off" />}
        </Field>
        <Field label="Position" error={errors.position}>
          {({ id }) => <Input id={id} name="position" defaultValue={v.position ?? ""} maxLength={120} placeholder="Role or title" autoComplete="off" />}
        </Field>
        <Field label="City" error={errors.city}>
          {({ id }) => <Input id={id} name="city" defaultValue={v.city ?? ""} maxLength={120} placeholder="Where they're based" autoComplete="off" />}
        </Field>
        <ListInputs label="Phone" name="phones" values={v.phones} type="tel" inputMode="tel" error={errors.phones} />
        <Field label="Where you met" error={errors.whereMet}>
          {({ id }) => <Input id={id} name="whereMet" defaultValue={m.whereMet ?? ""} maxLength={200} placeholder="Event, intro, venue…" autoComplete="off" />}
        </Field>
        <Field label="Met on" error={errors.metOn}>
          {({ id }) => <Input id={id} name="metOn" type="date" defaultValue={m.metOn ?? today} />}
        </Field>
        <BirthdayField birthday={v.birthday} error={errors.birthday} />
        <Field label="Interests" error={errors.interests} className="sm:col-span-2">
          {({ id }) => <Input id={id} name="interests" defaultValue={m.interests.join(", ")} placeholder="Comma separated" autoComplete="off" />}
        </Field>
        <Field label="Potential opportunities" error={errors.opportunities} className="sm:col-span-2">
          {({ id }) => <Textarea id={id} name="opportunities" rows={2} defaultValue={m.opportunities ?? ""} maxLength={2000} placeholder="How you could help each other" />}
        </Field>
        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
          {({ id }) => <Textarea id={id} name="notes" rows={4} defaultValue={m.notes ?? ""} maxLength={10000} placeholder="First impressions, what they care about, family, quirks…" />}
        </Field>
        <Field label="Tags" error={errors.tags} className="sm:col-span-2">
          {({ id }) => <Input id={id} name="tags" defaultValue={m.tags.join(", ")} placeholder="investor, lagos, fintech" autoComplete="off" />}
        </Field>
      </div>
      <ProfileFields socials={v.socials} />
      <label className="flex items-center gap-2 font-[550]">
        <input type="checkbox" name="starred" defaultChecked={m.starred} className="size-4 accent-[var(--accent)]" />
        Priority relationship
      </label>
      <details open={moreOpen} className="rounded-md border border-line bg-surface px-3.5 py-2.5">
        <summary className="cursor-pointer text-[14px] font-semibold">More: {spaces.length > 1 ? "Space, " : ""}circle and reminder</summary>
        <div className="grid gap-4 pt-3 sm:grid-cols-2">
          {spaces.length > 1 ? (
            <Field label="Space" error={errors.spaceId} className="sm:col-span-2">
              {({ id, describedBy }) => (
                <Select id={id} name="spaceId" value={spaceId} onChange={(e) => (setSpaceId(e.target.value), setCircleId(""))} aria-describedby={describedBy}>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <input type="hidden" name="spaceId" value={spaceId} />
          )}
          <Field label="Circle" error={errors.circleId} hint={space?.circles.length ? undefined : "Add circles in Account → Spaces."}>
            {({ id, describedBy }) => (
              <Select id={id} name="circleId" value={circleId} onChange={(e) => setCircleId(e.target.value)} aria-describedby={describedBy} disabled={!space?.circles.length}>
                <option value="">None</option>
                {space?.circles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Reminder" error={errors.cadenceDays}>
            {({ id }) => (
              <Select id={id} name="cadence" defaultValue="inherit">
                <option value="inherit">
                  {circle ? `${circle.name} default` : "Space default"} ({cadenceLabel(inherited).toLowerCase()})
                </option>
                {known.map((c) => (
                  <option key={c.days} value={String(c.days)}>
                    {c.label}
                  </option>
                ))}
                <option value="never">Never</option>
              </Select>
            )}
          </Field>
        </div>
      </details>
    </div>
  );
}

function readIdentity(f: FormData): PersonIdentityInput {
  const month = String(f.get("bMonth") ?? "");
  const day = String(f.get("bDay") ?? "");
  return {
    name: String(f.get("name") ?? ""),
    company: String(f.get("company") ?? ""),
    position: String(f.get("position") ?? ""),
    city: String(f.get("city") ?? ""),
    emails: f.getAll("emails").map(String),
    phones: f.getAll("phones").map(String),
    birthday: month && day ? `${month}-${day}` : null,
    socials: Object.fromEntries(socialKeys.map((k) => [k, String(f.get(`s_${k}`) ?? "")])),
  };
}

function MembershipFields({ v, spaces, errors, chooseSpace }: { v: MembershipValues; spaces: SpaceOption[]; errors: Record<string, string>; chooseSpace: boolean }) {
  const [spaceId, setSpaceId] = useState(v.spaceId);
  const space = spaces.find((s) => s.id === spaceId);
  const [circleId, setCircleId] = useState(v.circleId ?? "");
  const circle = space?.circles.find((c) => c.id === circleId);
  const inherited = circle?.defaultCadenceDays ?? space?.defaultCadenceDays ?? null;
  const cadenceValue = v.cadenceDays === 0 ? "never" : v.cadenceDays == null ? "inherit" : String(v.cadenceDays);
  const known = cadenceChoices.filter((c) => c.days !== null);
  return (
    <div className="grid gap-5">
      {chooseSpace ? (
        <Field label="Space" error={errors.spaceId}>
          {({ id, describedBy }) => (
            <Select id={id} name="spaceId" value={spaceId} onChange={(e) => (setSpaceId(e.target.value), setCircleId(""))} aria-describedby={describedBy}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <input type="hidden" name="spaceId" value={spaceId} />
      )}
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <Field label="Where you met" error={errors.whereMet}>
          {({ id }) => <Input id={id} name="whereMet" defaultValue={v.whereMet ?? ""} maxLength={200} placeholder="Event, intro, venue…" autoComplete="off" />}
        </Field>
        <Field label="When" error={errors.metOn}>
          {({ id }) => <Input id={id} name="metOn" type="date" defaultValue={v.metOn ?? ""} />}
        </Field>
      </div>
      <Field label="Interests" hint="Separate with commas." error={errors.interests}>
        {({ id, describedBy }) => <Input id={id} name="interests" defaultValue={v.interests.join(", ")} aria-describedby={describedBy} autoComplete="off" />}
      </Field>
      <Field label="Notes" hint="What they care about, what they told you, anything worth remembering." error={errors.notes}>
        {({ id, describedBy }) => <Textarea id={id} name="notes" rows={5} defaultValue={v.notes ?? ""} maxLength={10000} aria-describedby={describedBy} />}
      </Field>
      <Field label="How you could help each other" error={errors.opportunities}>
        {({ id }) => <Textarea id={id} name="opportunities" rows={2} defaultValue={v.opportunities ?? ""} maxLength={2000} />}
      </Field>
      <Field label="Tags" hint="Separate with commas, e.g. investor, fintech." error={errors.tags}>
        {({ id, describedBy }) => <Input id={id} name="tags" defaultValue={v.tags.join(", ")} aria-describedby={describedBy} autoComplete="off" />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Circle" error={errors.circleId} hint={space?.circles.length ? undefined : "Add circles in Settings → Spaces."}>
          {({ id, describedBy }) => (
            <Select id={id} name="circleId" value={circleId} onChange={(e) => setCircleId(e.target.value)} aria-describedby={describedBy} disabled={!space?.circles.length}>
              <option value="">None</option>
              {space?.circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reminder" error={errors.cadenceDays}>
          {({ id }) => (
            <Select id={id} name="cadence" defaultValue={cadenceValue}>
              <option value="inherit">
                {circle ? `${circle.name} default` : "Space default"} ({cadenceLabel(inherited).toLowerCase()})
              </option>
              {known.map((c) => (
                <option key={c.days} value={String(c.days)}>
                  {c.label}
                </option>
              ))}
              <option value="never">Never</option>
            </Select>
          )}
        </Field>
      </div>
      <label className="flex items-center gap-2 font-[550]">
        <input type="checkbox" name="starred" defaultChecked={v.starred} className="size-4 accent-[var(--accent)]" />
        Priority relationship
      </label>
    </div>
  );
}

function readMembership(f: FormData): MembershipInput {
  const cadence = String(f.get("cadence") ?? "inherit");
  return {
    spaceId: String(f.get("spaceId") ?? ""),
    whereMet: String(f.get("whereMet") ?? ""),
    metOn: String(f.get("metOn") ?? ""),
    interests: String(f.get("interests") ?? ""),
    notes: String(f.get("notes") ?? ""),
    opportunities: String(f.get("opportunities") ?? ""),
    tags: String(f.get("tags") ?? ""),
    circleId: String(f.get("circleId") ?? ""),
    cadenceDays: cadence === "inherit" ? null : cadence === "never" ? "never" : Number(cadence),
    starred: f.get("starred") === "on",
  };
}

function Submit({ busy, label, busyLabel, onCancel }: { busy: boolean; label: string; busyLabel: string; onCancel?: () => void }) {
  const router = useRouter();
  return (
    <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-bg px-4 py-3">
      <Button variant="ghost" onClick={onCancel ?? (() => router.back())}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? busyLabel : label}
      </Button>
    </div>
  );
}

/** Add a person with everything you know. Works offline: it's queued like any capture. */
export function NewPersonForm({
  spaces,
  defaultSpaceId,
  initial,
  today,
  onCancel,
}: {
  spaces: SpaceOption[];
  defaultSpaceId: string;
  initial?: { identity: Identity; notes: string | null; note?: string };
  today: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const finish = useFinishForm();
  const after = useAfterCapture();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const id = crypto.randomUUID();
    setBusy(true);
    const r = await sendCapture({ kind: "person", data: { id, identity: readIdentity(f), membership: readMembership(f) } });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.field ? { [r.field]: r.message } : {});
      setMessage(r.field ? null : r.message);
      return;
    }
    const name = String(f.get("name") ?? "").trim().split(/\s+/)[0];
    after(r, `${name} added.`);
    // Replace the form with the new person's record (prototype: "opens the new person's sheet").
    if (r.queued) router.push("/people");
    else finish(`/people/${id}`, "replace");
  }
  return (
    <form onSubmit={submit} className="grid gap-6" noValidate aria-label="Add person">
      {initial?.note ? <p className="rounded-md bg-sunken p-3 text-small">{initial.note}</p> : null}
      <NewPersonFields v={initial?.identity ?? emptyIdentity} m={{ ...emptyMembership(defaultSpaceId), notes: initial?.notes ?? null }} spaces={spaces} errors={errors} today={today} />
      <ErrorText>{message ?? undefined}</ErrorText>
      <Submit busy={busy} label="Add person" busyLabel="Saving…" onCancel={onCancel} />
    </form>
  );
}

function useSave(after: string) {
  const finish = useFinishForm();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<FormState>, to: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setErrors(r.fieldErrors ?? {});
    setMessage(r.message ?? null);
    if (r.ok) {
      toast.show(after);
      finish(to);
    }
  };
  return { errors, message, busy, run };
}

export function EditIdentityForm({ personId, identity }: { personId: string; identity: Identity }) {
  const s = useSave("Changes saved.");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const input = readIdentity(new FormData(e.currentTarget));
        void s.run(() => updateIdentityAction(personId, input), `/people/${personId}`);
      }}
      className="grid gap-8"
      noValidate
    >
      <IdentityFields v={identity} errors={s.errors} />
      <ErrorText>{s.message ?? undefined}</ErrorText>
      <Submit busy={s.busy} label="Save changes" busyLabel="Saving…" />
    </form>
  );
}

export function MembershipForm({ personId, spaces, values, isNew }: { personId: string; spaces: SpaceOption[]; values: MembershipValues; isNew: boolean }) {
  const s = useSave(isNew ? "Added to the Space." : "Changes saved.");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const input = readMembership(new FormData(e.currentTarget));
        void s.run(() => saveMembershipAction(personId, input), `/people/${personId}`);
      }}
      className="grid gap-8"
      noValidate
    >
      <MembershipFields v={values} spaces={spaces} errors={s.errors} chooseSpace={isNew && spaces.length > 1} />
      <ErrorText>{s.message ?? undefined}</ErrorText>
      <Submit busy={s.busy} label={isNew ? "Add to Space" : "Save changes"} busyLabel="Saving…" />
    </form>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Sheet } from "@/ui/sheet";
import { useToast } from "@/ui/toast";
import { saveProfileGoalsAction } from "./actions";

/* The prototype's goal types (L413), in its order. */
const types = [
  ["capital", "Raise capital"],
  ["clients", "Win clients"],
  ["hiring", "Hire talent"],
  ["market", "Enter a market"],
  ["partners", "Find partners"],
  ["mentors", "Find mentors"],
  ["career", "Career move"],
  ["other", "Other"],
] as const;

export type ProfileGoalsValues = {
  name: string;
  location: string;
  headline: string;
  background: string;
  offerings: string;
  industries: string;
  emails: string;
  goals: { id: string | null; text: string; type: string; priority: number; weeklyTarget: number; active: boolean }[];
};

type Row = ProfileGoalsValues["goals"][number] & { key: string };
let n = 0;
const blank = (): Row => ({ key: `new-${n++}`, id: null, text: "", type: "other", priority: 1, weeklyTarget: 3, active: true });

/**
 * "Edit profile & goals" / "Set up your profile" (prototype L1155–1177): the questions the
 * prototype asks, and one row per networking goal. Opens itself when the URL has `?edit=profile`
 * (from Today's "Set goals" and the goals card).
 */
export function ProfileGoalsButton({ values, label, variant = "primary" }: { values: ProfileGoalsValues; label: string; variant?: "primary" | "secondary" }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(params.get("edit") === "profile");
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && params.get("edit")) router.replace("/goals", { scroll: false });
  };
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <ProfileGoalsSheet values={values} open={open} onOpenChange={close} /> : null}
    </>
  );
}

function ProfileGoalsSheet({ values, open, onOpenChange }: { values: ProfileGoalsValues; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [v, setV] = useState(values);
  const [rows, setRows] = useState<Row[]>(() => (values.goals.length ? values.goals.map((g) => ({ ...g, key: g.id ?? `new-${n++}` })) : [blank()]));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const set = (k: keyof Omit<ProfileGoalsValues, "goals">) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const legend = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveProfileGoalsAction({ ...v, goals: rows.map((r) => ({ id: r.id, text: r.text, type: r.type, priority: r.priority, weeklyTarget: r.weeklyTarget, active: r.active })) });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return setMessage(r.message ?? "That didn't save.");
      }
      onOpenChange(false);
      // A goal you just added opens on its own page, where "Start here" says what to do next.
      if (r.id) {
        toast.show("Saved. Here's your new goal.");
        router.push(`/goals/${r.id}`);
      } else toast.show("Profile saved.");
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Profile & goals">
      <form onSubmit={submit} className="grid gap-5" noValidate aria-label="Profile & goals">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" error={errors.name}>
            {({ id, describedBy, invalid }) => <Input id={id} value={v.name} onChange={set("name")} maxLength={80} aria-describedby={describedBy} aria-invalid={invalid} autoComplete="name" />}
          </Field>
          <Field label="Based in" error={errors.location}>
            {({ id, describedBy }) => <Input id={id} value={v.location} onChange={set("location")} maxLength={80} placeholder="City, country" aria-describedby={describedBy} />}
          </Field>
          <Field label="Headline" error={errors.headline} className="sm:col-span-2">
            {({ id, describedBy }) => <Input id={id} value={v.headline} onChange={set("headline")} maxLength={120} placeholder="What you do in one line" aria-describedby={describedBy} />}
          </Field>
          <Field label="Background" error={errors.background} className="sm:col-span-2">
            {({ id, describedBy }) => <Textarea id={id} value={v.background} onChange={set("background")} rows={3} maxLength={2000} placeholder="Experience, past roles, what you are known for" aria-describedby={describedBy} />}
          </Field>
          <Field label="What you offer" error={errors.offerings} className="sm:col-span-2">
            {({ id, describedBy }) => <Textarea id={id} value={v.offerings} onChange={set("offerings")} rows={2} maxLength={1000} placeholder="Products, services, skills, capital, access" aria-describedby={describedBy} />}
          </Field>
          <Field label="Target industries" error={errors.industries} className="sm:col-span-2">
            {({ id, describedBy }) => <Input id={id} value={v.industries} onChange={set("industries")} maxLength={400} placeholder="Fintech, energy, real estate…" aria-describedby={describedBy} />}
          </Field>
          <Field label="Your email addresses" hint="Used to recognise you in calendar imports." error={errors.emails} className="sm:col-span-2">
            {({ id, describedBy, invalid }) => <Input id={id} value={v.emails} onChange={set("emails")} maxLength={1000} placeholder="Comma separated" aria-describedby={describedBy} aria-invalid={invalid} autoComplete="off" />}
          </Field>
        </div>

        <fieldset className="grid gap-3" aria-labelledby={legend}>
          <legend id={legend} className="pb-1 text-[13px] font-semibold text-muted">
            Networking goals
          </legend>
          {rows.map((g, i) => (
            <div key={g.key} className="grid gap-2 rounded-md border border-line bg-surface p-3" role="group" aria-label={`Goal ${i + 1}`}>
              <Input value={g.text} onChange={(e) => update(g.key, { text: e.target.value })} maxLength={140} placeholder="e.g. Raise a $500k pre-seed by March" aria-label="Goal" />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={(types as readonly (readonly string[])[]).some(([k]) => k === g.type) ? g.type : "other"} onChange={(e) => update(g.key, { type: e.target.value })} aria-label="Goal type" className="h-10 w-auto">
                  {types.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Select value={String(g.priority)} onChange={(e) => update(g.key, { priority: Number(e.target.value) })} aria-label="Priority" className="h-10 w-auto">
                  <option value="1">High priority</option>
                  <option value="2">Medium priority</option>
                  <option value="3">Low priority</option>
                </Select>
                <label className="inline-flex items-center gap-2 text-[13.5px] text-muted">
                  <Input type="number" min={1} max={50} value={g.weeklyTarget} onChange={(e) => update(g.key, { weeklyTarget: Number(e.target.value) || 1 })} className="h-10 w-[4.5rem]" aria-label="Touches a week" />
                  touches a week
                </label>
                <label className="inline-flex items-center gap-2 text-[13.5px] text-muted">
                  <input type="checkbox" checked={g.active} onChange={(e) => update(g.key, { active: e.target.checked })} className="size-[18px] accent-[var(--accent)]" />
                  Active
                </label>
                <Button variant="link" size="sm" className="text-bad" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== g.key) : [blank()]))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" onClick={() => setRows((rs) => [...rs, blank()])}>
              + Add goal
            </Button>
          </div>
        </fieldset>

        {message ? (
          <p role="alert" className="text-[14px] font-[550] text-bad">
            {message}
          </p>
        ) : null}
        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-bg px-4 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

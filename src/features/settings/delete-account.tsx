"use client";

import { useActionState, useState } from "react";
import { initialFormState } from "@/features/forms";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { deleteAccountAction } from "./actions";

/** Delete account, confirmed by typing your email. */
export function DeleteAccount({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteAccountAction, initialFormState);
  if (!email) return <p className="text-small text-muted">Your account has no email address, so it can&apos;t be deleted from here. Contact support.</p>;
  if (!open) {
    return (
      <div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="grid max-w-[480px] gap-4 rounded-md border border-danger/40 p-4" noValidate>
      <p>
        This deletes your people, rooms, goals, notes, research and connections, and your sign-in. It can&apos;t be undone. Export your data first if you want a copy.
      </p>
      <Field label={`Type ${email} to confirm`} error={state.fieldErrors?.confirm}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="confirm" type="email" autoComplete="off" spellCheck={false} aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      {state.message ? (
        <p role="alert" className="text-small text-danger">
          {state.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

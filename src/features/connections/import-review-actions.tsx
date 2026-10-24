"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Field, Select } from "@/ui/field";
import { cancelImportAction, commitImportAction } from "./import-actions";

export function ImportReviewActions({ importId, spaces, defaultSpaceId, label }: { importId: string; spaces: { id: string; name: string }[]; defaultSpaceId: string; label: string }) {
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      {spaces.length > 1 ? (
        <Field label="Put new people in" hint="People you already have stay in their Spaces.">
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="max-w-[320px]">
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await commitImportAction(importId, spaceId);
              if (r?.message) setMessage(r.message);
            })
          }
        >
          {pending ? "Importing…" : label}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => start(() => cancelImportAction(importId))}>
          Cancel import
        </Button>
      </div>
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

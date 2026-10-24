"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore, useTransition } from "react";
import { providerLabels, type ProviderKind } from "@/contracts/connections";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { addIcsLinkAction, disconnectAction, importPickedContactsAction, syncNowAction, undoImportAction, type IcsFormState } from "./actions";
import { FileImport } from "./file-import";
import { JobProgress } from "./job-progress";

export type ConnectionRow = {
  id: string;
  provider: ProviderKind;
  label: string;
  status: string;
  lastError: string | null;
  lastSynced: string | null;
  spaceName: string | null;
};
export type ImportRow = { id: string; what: string; when: string; spaceName: string; detail: string; status: string };

type Props = {
  connections: ConnectionRow[];
  spaces: { id: string; name: string }[];
  imports: ImportRow[];
  configured: { google: boolean; microsoft: boolean };
  initialJobId: string | null;
  notice: string | null;
  /** Where the OAuth flow comes back to. */
  returnTo: string;
};

export function ConnectionsPanel({ connections, spaces, imports, configured, initialJobId, notice, returnTo }: Props) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [jobId, setJobId] = useState(initialJobId);

  return (
    <div className="grid gap-8">
      {notice ? (
        <p role="alert" className="rounded-md border border-border bg-surface p-4 text-small">
          {notice}
        </p>
      ) : null}
      {jobId ? <JobProgress key={jobId} jobId={jobId} onDismiss={() => setJobId(null)} /> : null}

      {spaces.length > 1 ? (
        <Field label="Put new people in" hint="New contacts land in this Space for you to sort. Existing people stay where they are.">
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

      <ul className="grid gap-4">
        {(["google", "microsoft"] as const).map((p) => (
          <OAuthCard
            key={p}
            provider={p}
            configured={configured[p]}
            accounts={connections.filter((c) => c.provider === p)}
            connectHref={`/api/oauth/${p}/start?space=${encodeURIComponent(spaceId)}&return=${encodeURIComponent(returnTo)}`}
            onJob={setJobId}
          />
        ))}
        <IcsCard accounts={connections.filter((c) => c.provider === "apple_ics")} spaceId={spaceId} onJob={setJobId} />
        <PhoneCard spaceId={spaceId} />
        <Card title="Files" what="Contacts or calendar files you've exported. You'll see what will change before anything is saved.">
          <FileImport spaceId={spaceId} />
        </Card>
      </ul>

      <ImportsList imports={imports} />
    </div>
  );
}

function Card({ title, what, children }: { title: string; what: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-3 rounded-md border border-border bg-surface p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-small text-muted">{what}</p>
      </div>
      {children}
    </li>
  );
}

function AccountRow({ account, onJob }: { account: ConnectionRow; onJob: (id: string) => void }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const needsReconnect = account.status === "error" && account.lastError === "reconnect";
  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 truncate font-[550]">{account.label}</span>
        <span className={`text-small ${account.status === "error" ? "text-danger" : "text-muted"}`}>
          {needsReconnect ? "Needs reconnecting" : account.status === "error" ? (account.lastError ?? "Last sync failed") : account.lastSynced ? `Synced ${account.lastSynced}` : "Not synced yet"}
          {account.spaceName ? ` · into ${account.spaceName}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await syncNowAction(account.id);
              if (r.jobId) onJob(r.jobId);
              else toast.show(r.message ?? "Couldn't start a sync.");
            })
          }
        >
          Sync now
        </Button>
        {confirming ? (
          <>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await disconnectAction(account.id);
                  toast.show("Disconnected. The people and rooms already imported stay.");
                })
              }
            >
              Disconnect
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep connected
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Disconnect…
          </Button>
        )}
      </div>
    </div>
  );
}

function OAuthCard({
  provider,
  configured,
  accounts,
  connectHref,
  onJob,
}: {
  provider: "google" | "microsoft";
  configured: boolean;
  accounts: ConnectionRow[];
  connectHref: string;
  onJob: (id: string) => void;
}) {
  const label = providerLabels[provider];
  const reconnect = accounts.some((a) => a.status === "error" && a.lastError === "reconnect");
  return (
    <Card title={label.name} what={label.what}>
      {configured ? (
        <div>
          <Button asChild variant={accounts.length ? "secondary" : "primary"} size="sm">
            {/* A full navigation, not a client transition: it leaves for the provider's sign-in page. */}
            <a href={connectHref}>{reconnect ? `Reconnect ${label.name}` : accounts.length ? "Connect another account" : `Connect ${label.name}`}</a>
          </Button>
        </div>
      ) : (
        <p className="text-small text-muted">Not set up on this server yet. The README explains how to add the keys.</p>
      )}
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} onJob={onJob} />
      ))}
    </Card>
  );
}

function IcsCard({ accounts, spaceId, onJob }: { accounts: ConnectionRow[]; spaceId: string; onJob: (id: string) => void }) {
  const [state, action, pending] = useActionState(async (prev: IcsFormState, fd: FormData) => {
    const r = await addIcsLinkAction(prev, fd);
    if (r.jobId) onJob(r.jobId);
    return r;
  }, {} as IcsFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <Card title={providerLabels.apple_ics.name} what={providerLabels.apple_ics.what}>
      <form action={action} key={state.savedAt} className="grid gap-3" noValidate>
        <input type="hidden" name="spaceId" value={spaceId} />
        <Field
          label="Calendar link"
          hint="On iPhone: Calendar, tap the calendar's info button, turn on Public Calendar, then Share Link. The link is stored encrypted."
          error={errors.url ?? errors.spaceId}
        >
          {({ id, describedBy, invalid }) => (
            <Input id={id} name="url" type="url" inputMode="url" placeholder="webcal://…" autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add calendar"}
          </Button>
        </div>
      </form>
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} onJob={onJob} />
      ))}
    </Card>
  );
}

type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; email?: string[]; tel?: string[] }[]> };
const pickerSupported = () => typeof navigator !== "undefined" && "contacts" in navigator && typeof window !== "undefined" && "ContactsManager" in window;
const noop = () => () => {};

function PhoneCard({ spaceId }: { spaceId: string }) {
  const supported = useSyncExternalStore(noop, pickerSupported, () => false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const pick = () =>
    start(async () => {
      try {
        const picked = await (navigator as unknown as { contacts: ContactsManager }).contacts.select(["name", "email", "tel"], { multiple: true });
        if (!picked.length) return;
        const r = await importPickedContactsAction({
          spaceId,
          contacts: picked.map((c) => ({ name: c.name ?? [], email: c.email ?? [], tel: c.tel ?? [] })),
        });
        toast.show(r.ok ? `${r.added} added, ${r.updated} updated. Sort them from People.` : (r.message ?? "Couldn't import those contacts."));
      } catch {
        toast.show("Couldn't open your contacts.");
      }
    });
  return (
    <Card title="Phone contacts" what="Choose people from your phone's address book. Only the ones you pick are shared.">
      {supported ? (
        <div>
          <Button size="sm" disabled={pending} onClick={pick}>
            {pending ? "Importing…" : "Choose contacts"}
          </Button>
        </div>
      ) : (
        <p className="text-small text-muted">Available in Chrome on Android. On other phones, export your contacts as a .vcf file and add it under Files.</p>
      )}
    </Card>
  );
}

function ImportsList({ imports }: { imports: ImportRow[] }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const toast = useToast();
  if (!imports.length) return null;
  return (
    <section id="imports" className="grid gap-3">
      <h2 className="text-title font-semibold">Recent imports</h2>
      <p className="text-small text-muted">Undo removes the people, rooms and touches an import added. Details it filled in on people you already had stay.</p>
      <ul className="grid">
        {imports.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3">
            <div className="min-w-0">
              <p className="font-[550]">
                {i.what} <span className="font-normal text-muted">· {i.when}</span>
              </p>
              <p className="text-small text-muted">
                {i.status === "cancelled" ? "Undone" : i.status === "failed" ? "Didn't finish" : i.status === "review" ? "Waiting for you to review" : i.detail} · {i.spaceName}
              </p>
            </div>
            {i.status === "review" ? (
              <Button asChild size="sm">
                <Link href={`/settings/imports/${i.id}`}>Review</Link>
              </Button>
            ) : i.status === "done" ? (
              confirming === i.id ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await undoImportAction(i.id);
                        setConfirming(null);
                        toast.show("Import undone.");
                      })
                    }
                  >
                    Undo import
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Keep it
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming(i.id)}>
                  Undo…
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

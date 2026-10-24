import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { NewPersonForm } from "@/features/people/person-forms";
import { loadSpaceOptions } from "@/features/people/space-options";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { readSelectedSpaceId } from "@/server/space-selection";

export const metadata: Metadata = { title: "Add a person" };

export default function NewPersonPage() {
  return (
    <FormPage back="/people" backLabel="People" title="Add a person">
      <Suspense fallback={<LoadingRows rows={8} />}>
        <Form />
      </Suspense>
    </FormPage>
  );
}

async function Form() {
  const [user, selected] = await Promise.all([requireUser(), readSelectedSpaceId()]);
  const spaces = await db.withUser(user.id, loadSpaceOptions);
  const defaultSpaceId = spaces.find((s) => s.id === selected)?.id ?? spaces[0]?.id ?? "";
  return <NewPersonForm spaces={spaces} defaultSpaceId={defaultSpaceId} />;
}

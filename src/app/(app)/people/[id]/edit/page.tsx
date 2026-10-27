import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { EditPersonForm, loadPersonIdentity } from "@/features/people/person-form-loaders";
import { LoadingRows } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Edit person" };

export default function EditPersonPage({ params }: PageProps<"/people/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const p = await loadPersonIdentity((await params).id);
  return (
    <FormPage back={`/people/${p.id}`} backLabel={p.name} title={`Edit ${p.name}`}>
      <EditPersonForm p={p} />
    </FormPage>
  );
}

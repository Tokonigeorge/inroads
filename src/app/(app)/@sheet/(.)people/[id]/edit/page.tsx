import { Suspense } from "react";
import { EditPersonForm, loadPersonIdentity } from "@/features/people/person-form-loaders";
import { LoadingRows } from "@/features/shell/page-frame";
import { RouteSheet } from "@/features/shell/route-sheet";

type Props = { params: Promise<{ id: string }> };

/** "Edit {name}" as a sheet (prototype L1084). */
export default function EditPersonSheetPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <EditPersonSheet params={params} />
    </Suspense>
  );
}

async function EditPersonSheet({ params }: Props) {
  const p = await loadPersonIdentity((await params).id);
  return (
    <RouteSheet title={`Edit ${p.name}`}>
      <Suspense fallback={<LoadingRows rows={8} />}>
        <EditPersonForm p={p} />
      </Suspense>
    </RouteSheet>
  );
}

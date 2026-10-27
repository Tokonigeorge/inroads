import { Suspense } from "react";
import { ImportReview, importTitle } from "@/features/connections/import-review";
import { LoadingRows } from "@/features/shell/page-frame";
import { RouteSheet } from "@/features/shell/route-sheet";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** "Review import", then "Import complete", as a sheet over the page you imported from. */
export default function ImportSheetPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={null}>
      <ImportSheet params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ImportSheet({ params, searchParams }: Props) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const page = Math.max(0, Number(Array.isArray(q.page) ? q.page[0] : (q.page ?? 0)) || 0);
  return (
    <RouteSheet key={id} title={await importTitle(id)}>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <ImportReview id={id} page={page} />
      </Suspense>
    </RouteSheet>
  );
}

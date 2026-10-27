import { Suspense } from "react";
import { NewPersonFormLoader } from "@/features/people/person-form-loaders";
import { LoadedPersonRecord, PersonTitle } from "@/features/people/person-record";
import { LoadingRows } from "@/features/shell/page-frame";
import { RouteSheet } from "@/features/shell/route-sheet";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A person (or "Add person", for /people/new) opened from inside the app: the record as a
 * sheet over the page you were on, like the prototype's contact sheet.
 */
export default function PersonSheetPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={null}>
      <PersonSheet params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PersonSheet({ params, searchParams }: Props) {
  const { id } = await params;
  if (id === "new") {
    return (
      <RouteSheet title="Add person">
        <Suspense fallback={<LoadingRows rows={8} />}>
          <NewPersonFormLoader searchParams={searchParams} />
        </Suspense>
      </RouteSheet>
    );
  }
  return (
    <RouteSheet
      key={id}
      title={
        <Suspense fallback="Person">
          <PersonTitle params={params} />
        </Suspense>
      }
    >
      <Suspense fallback={<LoadingRows rows={6} />}>
        <LoadedPersonRecord params={params} />
      </Suspense>
    </RouteSheet>
  );
}

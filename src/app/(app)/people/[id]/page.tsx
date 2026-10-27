import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadedPersonRecord } from "@/features/people/person-record";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Person" };
// AI jobs started here may run right after the response (without Inngest).
export const maxDuration = 300;

/** A person opened from a link or a refresh: the record as a full page. Inside the app it opens as a sheet. */
export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <PageFrame>
      <div className="mx-auto max-w-[620px] pt-4">
        <Suspense fallback={<LoadingRows rows={6} />}>
          <LoadedPersonRecord params={params} />
        </Suspense>
      </div>
    </PageFrame>
  );
}

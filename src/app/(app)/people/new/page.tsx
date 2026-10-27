import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { NewPersonFormLoader } from "@/features/people/person-form-loaders";
import { LoadingRows } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Add person" };

export default function NewPersonPage({ searchParams }: PageProps<"/people/new">) {
  return (
    <FormPage back="/people" backLabel="People" title="Add person">
      <Suspense fallback={<LoadingRows rows={8} />}>
        <NewPersonFormLoader searchParams={searchParams} />
      </Suspense>
    </FormPage>
  );
}

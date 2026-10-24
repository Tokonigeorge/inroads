import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalForm } from "@/features/goals/goal-form";
import { goalFormSpaces } from "@/features/goals/space-choices";
import { FormPage } from "@/features/people/form-page";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { readSelectedSpaceId } from "@/server/space-selection";

export const metadata: Metadata = { title: "Add a goal" };

export default function NewGoalPage() {
  return (
    <FormPage back="/goals" backLabel="Goals" title="Add a goal">
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Form />
      </Suspense>
    </FormPage>
  );
}

async function Form() {
  const [user, selected] = await Promise.all([requireUser(), readSelectedSpaceId()]);
  const spaces = await db.withUser(user.id, goalFormSpaces);
  return <GoalForm spaces={spaces} defaultSpaceId={spaces.find((s) => s.id === selected)?.id ?? null} />;
}

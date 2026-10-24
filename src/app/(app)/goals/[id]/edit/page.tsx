import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GoalForm } from "@/features/goals/goal-form";
import { goalFormSpaces } from "@/features/goals/space-choices";
import { FormPage } from "@/features/people/form-page";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getGoal } from "@/server/repos/goals";
import { userContext } from "@/server/user-context";

export const metadata: Metadata = { title: "Edit goal" };

export default function EditGoalPage({ params }: PageProps<"/goals/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <Form params={params} />
    </Suspense>
  );
}

async function Form({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    const goal = await getGoal(tx, id, ctx.today, ctx.timezone);
    return goal ? { goal, spaces: await goalFormSpaces(tx) } : null;
  });
  if (!data) notFound();
  const { goal, spaces } = data;
  return (
    <FormPage back={`/goals/${goal.id}`} backLabel={goal.text} title="Edit goal">
    <GoalForm
      spaces={spaces}
      goal={{
        id: goal.id,
        text: goal.text,
        spaceId: goal.space.id,
        type: goal.type,
        priority: goal.priority,
        weeklyTarget: goal.weeklyTarget,
        dueOn: goal.dueOn,
        stages: goal.customStages ? goal.stages : null,
        hasPeople: goal.people > 0,
      }}
    />
    </FormPage>
  );
}

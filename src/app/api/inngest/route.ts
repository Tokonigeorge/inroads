import { serve } from "inngest/next";
import { functions, inngest } from "@/server/jobs/inngest";

/** Inngest calls this endpoint to run background jobs. Signed with INNGEST_SIGNING_KEY. */
export const { GET, POST, PUT } = serve({ client: inngest, functions });

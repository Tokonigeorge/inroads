import { z } from "zod";

// NEXT_PUBLIC_* values are inlined at build time, so they must be referenced literally.
const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_MAGIC_LINK_ENABLED: z.enum(["true", "false"]).default("false"),
  })
  .safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MAGIC_LINK_ENABLED: process.env.NEXT_PUBLIC_MAGIC_LINK_ENABLED,
  });

export const clientEnv = parsed.success
  ? { ...parsed.data, magicLinkEnabled: parsed.data.NEXT_PUBLIC_MAGIC_LINK_ENABLED === "true" }
  : null;

# Inroads

A personal relationship and networking tool for people whose work depends on who they know. It's built around three ideas: **goals first**, **rooms (events) as first-class**, and **a two-way promises ledger**. Lagos is the first market.

- Product brief: [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md)
- Technical plan: [`docs/TECH_PLAN.md`](docs/TECH_PLAN.md)
- Design system: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Changes: [`CHANGELOG.md`](CHANGELOG.md)
- The original single-file prototype (behavioural spec only): [`prototype/index.html`](prototype/index.html)

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres, Auth) · Drizzle ORM · Zod · Vitest · Playwright. Hosted on Vercel's free tier. Later milestones add Inngest, the Anthropic API and Resend.

## Run it locally

You need Node 22, pnpm 10, and a Supabase project (the free plan is fine).

```bash
pnpm install
cp .env.example .env.local      # then fill it in, see below
pnpm db:migrate                 # applies supabase/migrations to DATABASE_URL
pnpm dev                        # http://localhost:3000
```

Sign in with Google, then go to **Settings → Load example data** to see the app with a small Lagos network in it.

### One-time Supabase setup

1. **Create a project** at supabase.com and pick the **London (eu-west-2)** region.
2. **Google sign-in.**
   - In Google Cloud Console → APIs & Services → Credentials, create an *OAuth client ID* of type **Web application**.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Paste the client ID and secret into Supabase → Authentication → Sign In / Providers → Google.
   - This sign-in only asks for name and email. Contacts and Calendar access is a separate step (milestone 5).
3. **Redirect URLs.** In Supabase → Authentication → URL Configuration:
   - Set *Site URL* to your deployed URL, e.g. `https://inroads.vercel.app`.
   - Add these to *Redirect URLs*: `http://localhost:3000/**` and `https://inroads.vercel.app/**`.
4. **Keys and database.**
   - Project URL and anon (publishable) key: Supabase → Project Settings → API.
   - Database URL: Connect → *Transaction pooler* (port 6543) for the app.
   - Run migrations against the *Session pooler* (port 5432).

Email magic links are built but switched off (`NEXT_PUBLIC_MAGIC_LINK_ENABLED=false`) until there's a domain to send email from. See `docs/TECH_PLAN.md` §12.

## Environment variables

| Name | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | everything | `https://<ref>.supabase.co`. Inlined at build time. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything | Anon / publishable key. Safe in the browser; RLS protects data. |
| `DATABASE_URL` | server | Postgres connection string. The app connects as the table owner and drops to the `authenticated` role per request, so RLS applies (see `src/server/db/with-user.ts`). |
| `SUPABASE_SERVICE_ROLE_KEY` | later milestones | Server only. Never expose it. |
| `APP_URL` | server | Public base URL. |
| `NEXT_PUBLIC_MAGIC_LINK_ENABLED` | optional | `true` once a sending domain is set up. |
| `TEST_DATABASE_URL` | tests | Any Postgres 15+ server with contrib. Tests create their own databases on it. |
| `PW_CHROMIUM_PATH` | tests, optional | Use an installed Chromium instead of `playwright install`. |

Later milestones add `ANTHROPIC_API_KEY`, `AI_MODEL_FAST`, `AI_MODEL_STRONG`, `INNGEST_*`, `GOOGLE_CLIENT_*`, `MICROSOFT_CLIENT_*`, `TOKEN_ENC_KEYS`, `TOKEN_ENC_CURRENT` and `RESEND_API_KEY`.

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm test          # unit tests + database tests (RLS, Space sealing, triggers, example data)
pnpm build && pnpm test:e2e   # Playwright on desktop and mobile viewports, with axe accessibility checks
```

- **Database tests** run against plain Postgres. `supabase/tests/supabase-stub.sql` stands in for the parts of Supabase the migrations use: the `auth` schema, `auth.uid()` and the roles.
- **End-to-end tests** sign in through a small fake auth server (`tests/e2e/support/fake-supabase.ts`) that signs real ES256 tokens, so the app's real token verification runs unchanged. The build must use `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key` (CI does this).

## Database changes

Edit `src/server/db/schema.ts`, then run `pnpm db:generate`. Triggers, functions and grants go in a custom migration (`pnpm drizzle-kit generate --custom --name=...`). Every new user-owned table needs a `user_id`, the owner policies, and an entry in `tests/db/rls.test.ts`.

## Deploy (Vercel, free tier)

1. Import the GitHub repo in Vercel. It detects Next.js. Functions run in London (`vercel.json`).
2. Add the environment variables above under Project → Settings → Environment Variables.
3. Deploy. Before the first deploy, and after any schema change, run `DATABASE_URL=<session pooler URL> pnpm db:migrate`.
4. Put the deployed URL into Supabase's *Site URL* and *Redirect URLs*.

Vercel's free plan is for non-commercial use. Move to Pro before charging users. Supabase's free plan pauses a project after about a week with no activity; you can resume it from the dashboard.

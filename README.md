# Inroads

A personal relationship and networking tool for people whose work depends on who they know. It's built around three ideas: **goals first**, **rooms (events) as first-class**, and **a two-way promises ledger**. Lagos is the first market.

- Product brief: [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md)
- Technical plan: [`docs/TECH_PLAN.md`](docs/TECH_PLAN.md)
- Design system: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Changes: [`CHANGELOG.md`](CHANGELOG.md)
- The original single-file prototype (behavioural spec only): [`prototype/index.html`](prototype/index.html)

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres, Auth) · Drizzle ORM · Zod · Vitest · Playwright. Inngest for background jobs (optional) and the Anthropic API for AI features. Hosted on Vercel's free tier. Email (Resend) arrives in P2, with the daily brief by email.

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
| `SUPABASE_SERVICE_ROLE_KEY` | deleting accounts | Server only. Never expose it. Used to delete the sign-in through the Supabase Admin API (which also ends sessions). Without it the auth row is deleted directly in Postgres. |
| `APP_URL` | server | Public base URL. |
| `NEXT_PUBLIC_MAGIC_LINK_ENABLED` | optional | `true` once a sending domain is set up. |
| `TOKEN_ENC_KEYS` | connections | JSON map of key id to a base64 32-byte key, e.g. `{"v1":"…"}`. Encrypts OAuth tokens and calendar links (AES-256-GCM). Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `TOKEN_ENC_CURRENT` | connections | The key id new secrets are encrypted with (`v1`). To rotate, add `v2` to the map, set this to `v2`, and keep `v1` until old rows have re-synced. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google connection | See *Connect Google* below. Without them the Google card says it isn't set up. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Outlook connection | See *Connect Outlook* below. `MICROSOFT_TENANT` is optional (default `common`). |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | background sync | From Inngest (free tier). Without them a sync runs right after the request that started it, and there are no scheduled re-syncs. |
| `ANTHROPIC_API_KEY` | AI features | Server only. Without it, AI buttons say AI isn't set up and nothing else changes. |
| `AI_MODEL_FAST`, `AI_MODEL_STRONG` | optional | Override the model ids in `src/server/ai/config.ts`. |
| `AI_LIMIT_RESEARCH`, `AI_LIMIT_LOOKUP`, `AI_LIMIT_RADAR`, `AI_LIMIT_BRIEF`, `AI_LIMIT_DRAFT`, `AI_LIMIT_CARD`, `AI_LIMIT_CHAT`, `AI_LIMIT_SCORE`, `AI_LIMIT_CAPTURE`, `AI_LIMIT_ASK` | optional | Daily uses per person per feature (defaults 5, 5, 2, 4, 50, 30, 10, 3, 60, 20). Quick capture and Ask your network fall back to word matching when their limit is reached. Research also runs on its own for people you add by hand, and Look up for rooms you add (their plan); past the limit those quietly skip and the buttons still work the next day. |
| `AI_USER_MONTHLY_USD`, `AI_APP_MONTHLY_USD` | optional | Monthly AI spend caps per person (default 2) and for the whole app (default 25). |
| `TEST_DATABASE_URL` | tests | Any Postgres 15+ server with contrib. Tests create their own databases on it. |
| `PW_CHROMIUM_PATH` | tests, optional | Use an installed Chromium instead of `playwright install`. |

`RESEND_API_KEY` arrives with the emailed daily brief (P2).

### Connect Google (Contacts and Calendar)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or reuse the one used for sign-in).
2. APIs & Services → Library: enable the **People API** and the **Google Calendar API**.
3. OAuth consent screen: User type *External*, publishing status *Testing*. Add the scopes `contacts.readonly`, `calendar.events.readonly` and `calendar.calendarlist.readonly`. Under *Test users*, add the Google accounts that will use it (up to 100).
4. Credentials → Create credentials → OAuth client ID → *Web application*. Authorised redirect URIs:
   - `http://localhost:3000/api/oauth/google/callback`
   - `https://inroads.vercel.app/api/oauth/google/callback`
5. Put the client id and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

While the app is in Testing, Google expires the connection after 7 days; Inroads then shows "Needs reconnecting". Publishing the app (and Google's verification for these scopes) needs a domain with a privacy policy; see `docs/TECH_PLAN.md` §12.

### Connect Outlook (Microsoft 365 and Outlook.com)

1. In the [Azure portal](https://portal.azure.com/) → Microsoft Entra ID → App registrations → New registration. Supported account types: *Accounts in any organizational directory and personal Microsoft accounts*.
2. Redirect URI (Web): `https://inroads.vercel.app/api/oauth/microsoft/callback` (add the localhost one too).
3. API permissions → Microsoft Graph → Delegated: `User.Read`, `Contacts.Read`, `Calendars.Read`, `offline_access`.
4. Certificates & secrets → New client secret. Put the Application (client) ID and the secret value in `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`.

### Background jobs (Inngest)

1. Create a free account at [inngest.com](https://www.inngest.com/) and an app.
2. Copy the Event key and Signing key into `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` on Vercel.
3. After deploying, sync the app in Inngest with the URL `https://inroads.vercel.app/api/inngest`. That registers the sync, the 30-minute re-sync schedule and the daily clean-up.

Locally, `npx inngest-cli@latest dev` runs the dev server; or leave the keys unset and syncs run inline.

Calendar links (Apple iCloud, Outlook "publish", any `.ics`) and the Android Contact Picker need no setup.

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm test          # unit tests + database tests (RLS, Space sealing, triggers, example data)
pnpm build && pnpm test:e2e   # Playwright on desktop and mobile viewports, with axe accessibility checks
```

- **Database tests** run against plain Postgres. `supabase/tests/supabase-stub.sql` stands in for the parts of Supabase the migrations use: the `auth` schema, `auth.uid()` and the roles.
- **End-to-end tests** sign in through a small fake auth server (`tests/e2e/support/fake-supabase.ts`) that signs real ES256 tokens, so the app's real token verification runs unchanged. The same server plays Google (OAuth, People, Calendar) via `TEST_FAKE_PROVIDERS_URL`, so the connect → sync → sort flow runs end to end. The build must use `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key` (CI does this).

## Database changes

Edit `src/server/db/schema.ts`, then run `pnpm db:generate`. Triggers, functions and grants go in a custom migration (`pnpm drizzle-kit generate --custom --name=...`). Every new user-owned table needs a `user_id`, the owner policies, and an entry in `tests/db/rls.test.ts`.

## Deploy (Vercel, free tier)

1. Import the GitHub repo in Vercel. It detects Next.js. Functions run in London (`vercel.json`).
2. Add the environment variables above under Project → Settings → Environment Variables.
3. Deploy. Before the first deploy, and after any schema change, run `DATABASE_URL=<session pooler URL> pnpm db:migrate`.
4. Put the deployed URL into Supabase's *Site URL* and *Redirect URLs*.

Vercel's free plan is for non-commercial use. Move to Pro before charging users. Supabase's free plan pauses a project after about a week with no activity; you can resume it from the dashboard.

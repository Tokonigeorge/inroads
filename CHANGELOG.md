# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added: milestone 1 (scaffold, auth, schema, example data)
- Next.js 16 app with TypeScript strict, Tailwind v4 design tokens (light and dark), and base components: Button, Field, Input, ListRow, Avatar, PageHeader, Section, EmptyState, Sheet and Toast.
- App shell: sidebar on desktop; on mobile, a bottom nav with a central Capture button. Today, People, Rooms, Goals and Settings pages.
- Sign-in with Google through Supabase Auth. Email magic links are built but off until there's a domain. A proxy refreshes sessions and redirects signed-out visitors.
- Full P0 schema (25 tables) as Drizzle + SQL migrations:
  - Row-level security on every table.
  - Every request runs as the `authenticated` role, so RLS applies to server code too.
  - Cross-account references and cross-Space links are rejected by triggers.
  - OAuth token columns can't be read by users.
  - People are modelled as a graph (`people` + `person_spaces` + `person_links`).
  - New accounts get a profile and Work, Personal and Dating Spaces.
- Example Lagos network (6 people, 4 rooms, 2 goals). Load and remove it from Settings.
- PWA manifest, icons, and a service worker with an offline page.
- Tests:
  - Unit tests for date handling.
  - Database tests for RLS isolation, Space sealing, the research guardrail, triggers and example data.
  - Playwright smoke tests on desktop and mobile with axe accessibility checks in both themes.
- GitHub Actions CI: typecheck, lint, unit and database tests, build, end-to-end tests.

### Changed
- Moved the prototype to `prototype/index.html`.

### Added: planning
- `docs/TECH_PLAN.md`: stack, schema with RLS, prototype → module map, AI layer, integrations, screens, P0 milestones and open questions.
- `docs/DESIGN_SYSTEM.md`: tokens, components, copy rules and three example screens.
- `docs/DECISIONS.md`: decisions made during planning.

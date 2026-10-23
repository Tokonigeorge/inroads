# Inroads

A relationship/networking CRM — Today agenda with meeting prep, nudges (cold contacts, birthdays, promises owed, goals), contacts, events, and AI briefs. Single-file app exported from a Claude artifact.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
npx serve .        # or: python3 -m http.server 8000
```

Deploys as-is to GitHub Pages, Netlify, Vercel or Cloudflare Pages.

## What works outside claude.ai — and what doesn't

The app was built against the claude.ai artifact runtime (`window.claude.use(...)`). Off-platform that object doesn't exist, so `initStore()` falls back to **local mode** automatically:

| Feature | On claude.ai | Standalone (this repo) |
|---|---|---|
| UI, contacts, events, nudges, agenda | ✅ | ✅ |
| Storage | Cloud DB, synced to account (`C.use('db')`, `C.use('user')`) | `localStorage` only — one browser, one device |
| AI briefs / research (`C.use('sample')`) | ✅ | ❌ buttons show an "off" state |
| Web search via MCP (`C.use('mcp')`, Parallel Search connector) | ✅ | ❌ |
| Backup download (`C.use('downloads')`) | ✅ | ✅ via a plain Blob-download fallback added in `initStore()` |
| Permissions (`C.use('permissions')`) | ✅ | n/a |

## Where to start building

Every platform dependency goes through `initStore()` and the `S.*` handles it sets. That's the seam to replace:

1. **Storage** → swap `DB.refs.*` (`.doc(id).set()`, `.delete()`) for Supabase / Firebase / your own API. The shape is already document-per-record (`contacts`, events, `meta`), so Firestore or Supabase maps cleanly.
2. **Auth** → replace `C.use('user')` / `user.id()` with your auth provider's user id.
3. **AI** → `S.ai(prompt, opts)` returns `{text}` and `S.ai.json(prompt, opts)` returns parsed JSON. Back these with a small server route calling the Anthropic API — don't put an API key in the browser.
4. **Web search** → `S.mcp.describeTool` / tool calls on `WEB_SERVER`. Replace with a server-side search API call.

Before going much further, consider splitting `index.html` (~2,600 lines, inline CSS + JS) into `styles.css` / `app.js` modules, or porting to Vite — easier diffs and code review.

## Notes

- The first `<style>` block and the `<title>` placement in `<body>` come from the artifact publisher's wrapper; harmless, but clean up when you restructure.
- Fonts load from Google Fonts; JSZip from cdnjs.

# Dragonfly Companion

A phone companion for Dragonfly Uploader: an installable web app (PWA) for
iPhone and Android, with no app store. It signs in with the same Dragonfly
account, shows what the desktop app is doing, and can send a few safe
commands. The desktop app stays the only thing that touches files and
YouTube, and it carries out every command through its usual safety checks.

This folder is a separate project (Vite, React, TypeScript, supabase-js). It
shares no build or dependencies with the Electron app.

## What it does

- **Sign in** with email or username and password. Usernames go through the
  `dragonfly-username-login` function. Only the session tokens are kept, by
  supabase-js in localStorage; the password is never stored.
- **Computers**: your `dragonfly_devices`, online when seen in the last 10
  minutes. The only computer, or the last one opened, opens automatically.
- **Status**: the next upload, uploads left today, attention items, jobs with
  progress and held state, archives, and recent activity. It updates live
  (Supabase Realtime, with a 60-second poll as a fallback) and warns when the
  status is more than 10 minutes old.
- **Actions** (only when the computer has "Allow phone control" on): pause or
  resume the queue, check a held video on YouTube, resume from a held video
  (only when the computer reports it is safe), and scan an archive now. Each
  command shows its live status.

Contract: `dragonfly_devices`, `dragonfly_device_status` (snapshot v1) and
`dragonfly_device_commands`, migration
`supabase/migrations/20261031120000_dragonfly_companion.sql`.

## Develop

```sh
cd companion
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run typecheck
npm run build      # static files in companion/dist
```

## Configuration

The Supabase URL and publishable key are public by design and default to the
production project (the same values the desktop app ships with). To use
another project, copy `.env.example` to `.env` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Deploy

`npm run build` writes plain static files to `dist/` with relative paths
(`base: './'`), so they work from any folder on any static host. HTTPS is
required for install and the service worker.

- **GitHub Pages**: push the contents of `dist/` to the `gh-pages` branch (or
  the root) of a public repository and turn on Pages for it.
- **Cloudflare Pages**: build command `npm run build`, build output
  `dist`, root directory `companion`.
- **Any static host**: upload `dist/`. Serve `sw.js` and `index.html` with
  `Cache-Control: no-cache` so updates arrive promptly.

After choosing a host:

1. Set the desktop app's `COMPANION_URL` to the final address.
2. Make the `dragonfly-username-login` function answer the browser's CORS
   preflight (`OPTIONS`) and send `Access-Control-Allow-Origin` for that
   address. The version recorded in `supabase/functions` does not yet, so until
   then username sign-in fails on the phone (the page says so) and email
   sign-in works.

## Install on a phone

- **iPhone (Safari)**: open the address, tap Share, then **Add to Home Screen**.
- **Android (Chrome)**: open the address, then menu → **Install app**.

## Service worker

`public/sw.js` caches the app shell only (the page, built assets and icons).
It never caches API data: requests to other origins, including Supabase, and
anything other than GET go straight to the network.

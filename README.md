# 💸 Bill Tracker

A simple personal finance tracker that shows you where your money is going.
Log income and expenses, then watch the dashboard break it all down with
charts — no account, no server, no data leaving your browser.

![Bill Tracker dashboard](docs/screenshot.png)

## Features

- **Track everything** — log expenses and income with a description, amount,
  category, and date. Edit or delete entries anytime.
- **See where it goes** — a donut chart and ranked category breakdown show
  exactly what ate your budget each month.
- **Spot trends** — income vs. spending compared across the last six months.
- **Monthly summaries** — income, spending, net, and your all-time balance
  at a glance. Flip between months with the month picker.
- **16 built-in categories** with emoji and color coding (housing, groceries,
  dining out, subscriptions, and more).
- **Your data stays yours** — everything lives in your browser's
  localStorage. Use **Backup / Restore** (JSON) to move it between devices,
  or **Export CSV** to open it in a spreadsheet.
- **Sample data** — one click loads six months of realistic example data so
  you can explore the charts before entering your own.

## Getting started

You'll need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

First time in, click **Load sample data** to see the dashboard in action —
**Clear** wipes it when you're ready to start tracking for real.

## Building for production

```bash
npm run build      # outputs a static site to dist/
npm run preview    # serves the built site locally
```

The `dist/` folder is fully static — host it on any static file host
(GitHub Pages, Netlify, etc.) or just open it from a local server.

## How your data is stored

Out of the box the app runs in **local mode**: transactions are saved to
`localStorage` under the key `bill-tracker:transactions:v1`, so they persist
between visits on the same browser and device. Clearing your browser data
deletes them — use the **Backup** button to download a JSON snapshot you can
**Restore** later or on another machine.

## Cloud sync with Supabase (optional)

With a (free) [Supabase](https://supabase.com) project connected, the app
gains email magic-link sign-in and stores transactions in Postgres instead,
so your data follows you across devices. Setup:

1. In the Supabase dashboard, open **SQL Editor**, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
   and run it. This creates the `transactions` table with Row Level Security
   so each signed-in user can only access their own rows.
2. Copy your **Project URL** and **anon (publishable) key** from
   **Project Settings → API** into `src/config.js` (or set
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time). These are
   client-safe values — never use the `service_role` secret here.
3. In **Authentication → URL Configuration**, set the **Site URL** to where
   the app is hosted (e.g. your GitHub Pages URL) so magic links redirect
   back correctly.

When cloud sync is configured but you're signed out, the app keeps working
in local mode; after signing in it offers to import anything you'd entered
locally. The single-file build stays local-only (magic links can't redirect
to a `file://` page).

### Sharing your data with other people

Run `supabase/migrations/0002_sharing.sql` (same SQL Editor drill) to enable
sharing. A signed-in user then gets a **Sharing** panel listing the emails
allowed to open their data, each with an access level:

- **Full access** — add, edit, and delete entries
- **View only** — see everything, change nothing

The person you share with signs in with their own email (no invite step);
the app shows a switcher between their own data and anything shared with
them. Permissions are enforced by Postgres row-level security — the access
level holds even against direct API calls, and changing or removing someone
on the list takes effect immediately. Bulk actions (Restore, Clear, sample
data) stay owner-only.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds the app and publishes it to GitHub
Pages on every push. If the first run doesn't enable Pages automatically,
set **Settings → Pages → Source** to “GitHub Actions” once and re-run it.

## Tech

- [React 18](https://react.dev) + [Vite](https://vite.dev)
- [Recharts](https://recharts.org) for the charts
- Plain CSS — no framework
- Amounts are stored as integer cents to avoid floating-point rounding bugs

### Development extras

`node scripts/screenshot.mjs` runs a headless-browser smoke test against a
running preview server (`npm run preview`): it loads the app, pulls in the
sample data, fails on any console error, and saves `screenshot.png`.

# Hamdaz 2.0 — frontend

The web client for the Hamdaz ERP backend (`hamdaz-2.0`). Next.js App Router,
TypeScript, Tailwind v4, SWR.

## Running it

```bash
npm install
cp .env.local.example .env.local   # already done once
npm run dev                        # http://localhost:3000
```

`.env.local` needs two values:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_PREFIX=/api/v1
```

`npm run build` · `npm run typecheck`.

### Backend settings this depends on

Authentication is a **session cookie** the backend sets during the Entra
redirect, so every request goes out with `credentials: "include"` — which in
turn means the backend cannot use a wildcard CORS origin.

| Backend `.env` | Must be | Why |
| --- | --- | --- |
| `CORS_ORIGINS` | `http://localhost:3000` | This origin, explicitly. |
| `FRONTEND_URL` | `http://localhost:3000` | **Where the backend sends the browser after a successful sign-in** — it redirects to `{FRONTEND_URL}{next}`. Pointing it at the API's own host is what makes a login "work" and then land on a 404. |
| `AZURE_REDIRECT_URI` | `http://localhost:8000/api/v1/auth/callback` | Entra returns to the *backend*, which then redirects here. Must match the app registration byte for byte. |
| `COOKIE_SAMESITE` | `lax` locally | `localhost:3000 → localhost:8000` is same-site. Two different `*.azurewebsites.net` hosts are **not**, and need `none` plus `COOKIE_SECURE=true`. |

## How it is put together

```
src/
  app/
    layout.tsx            root: self-hosted font, theme script, API preconnect
    login/                the only page outside the shell
    (app)/
      layout.tsx          the shell — rail, tab bar, session, SWR config
      dashboard/          overview
      teams/              list, detail, members, team dashboard, team proposals
      directory/          Entra, list and person
      leave/              mine, request, calendar, HR queue, rules
      proposals/my-tasks/ SharePoint tasks assigned to the viewer
      quotes/             Zoho Books, list and detail
      comparisons/        list, new (upload → check → compare), saved detail
      admin/              roles, assignments, team access, user administration
  components/
    ui/                   primitives, controls, feedback — the design system
    shell/                rail, tab bar, wordmark, theme switch
    widgets/              one renderer per backend dashboard widget
    comparison/ leave/ proposals/ quotes/   module-specific pieces
  lib/
    api.ts     the only place that talks to the backend
    types.ts   transcribed from the backend OpenAPI document
    session.tsx  who is signed in and what they can reach
    tabs.tsx   the open-tab strip
    theme.tsx  light / dark / follow-the-system
    nav.ts     the rail and the tab labels, from the viewer's access
    format.ts  dates, money, names
    hooks.ts   useAction, useDebounced
```

## The design

A dark analytics workspace: a near-black canvas with panels floating on it,
pill controls, a tab strip along the top, and one hero panel per screen
carrying the numbers.

**Colour.** The two brand values from the Hamdaz mark — wordmark blue
`#45BEED`, bar pink `#EF4896`. They are used almost nowhere as flat fills.
Their real job is **the ramp**: every bar, meter and track runs blue → pink, so
a length reads as a position on one continuous scale instead of a legend
lookup. `RampBar` slices that gradient per segment, so adjacent segments
*continue* the ramp rather than restarting it, and each prints its own value
inside its rounded end. Where a series has an urgency order, it is laid out
least-urgent first so the pink end always means "deal with this".

Both brand colours are light, so **text on a filled blue or pink surface is
always a dark ink, never white**. The `-text` variants exist for the opposite
case and are darkened in light mode to pass contrast. `danger` is pushed
towards orange-red and `info` towards indigo, specifically so neither reads as
a brand colour at badge size.

**Theming.** Every colour is a token in `app/globals.css`; no component
branches on the theme. Three states, not two — light, dark, and
follow-the-system; "system" stamps no attribute so the media query does the
work. An inline script in the root layout applies the saved choice before first
paint. The two dark blocks are necessarily duplicated (one lives inside a media
query, and CSS cannot share custom properties across that boundary) — **edit
them together**.

**Tabs.** Screens stay open along the top. A tab is only ever a route — every
screen reads its own data and SWR still has it cached — so the strip is a list
of paths, which is why it survives a reload for free. Kept in
`sessionStorage`, capped at eight.

## Speed

The things that were actually slow, and what was done:

- **The session waterfall.** `/auth/me` used to gate the other four session
  calls, putting a guaranteed second round trip in front of every cold load.
  All five now fire together — they authenticate from the same cookie, so
  gating bought nothing.
- **SharePoint in the shell.** The "what's due today" rail lived in the top
  bar, so its SharePoint list sweep — the slowest call in the app — ran on
  *every* page. It now lives on the dashboard alone.
- **The font.** Inter is self-hosted via `next/font` instead of a
  render-blocking Google stylesheet, which also removes a DNS lookup and a TLS
  handshake to a third origin before first paint.
- **API preconnect.** The root layout warms the connection to the API origin,
  so the shell's first call does not also pay for the handshake.
- **Navigation.** A 30s SWR dedupe window means returning to an open tab serves
  from cache without a request.

What is still slow is the backend's own remote reads — a team dashboard renders
Graph and SharePoint live, and the comparison analyse step calls a model. Those
show progressive skeletons rather than blocking the page.

## Navigation is not a static list

The backend's module catalogue (`app/access/catalogue.py`) already names every
frontend route — deliberate on its side, so one catalogue drives both the
permission model and the navigation. `lib/nav.ts` adds only an icon and an
order; what appears comes from `/access/me`, so nobody is shown a link that
would 403.

Two exceptions, both matching the backend's own comments: **Leave** and
**Quotes** are open to every signed-in person — their endpoints check nothing
beyond a session — so `lib/session.tsx` adds them back after the grant-driven
list. Admin screens are gated on the global role instead, because admin-only
modules are never granted to a team. The HR-only leave screens appear by
comparing the viewer's teams against `hr_team_slug` from `/leave/settings`, so
HR sees a queue rather than a 403.

## Widgets

`/dashboards/me` and `/teams/{slug}/dashboard` return widgets the backend has
already rendered — key, size, and a `data` payload whose shape depends on the
key. `components/widgets/index.tsx` is the switchboard. A widget with no
renderer falls through to its raw JSON rather than vanishing, so adding one on
the backend is never a silent no-op here. A widget that cannot answer returns
`{available: false, reason}` and is rendered as that reason in place.

## Types

`lib/types.ts` is transcribed from the backend's OpenAPI document, not
invented. Where the backend types something as a bare `object` — widget
payloads, the comparison analysis, profile sections — the real shape is written
out from the code that builds it and marked as such. To regenerate the
reference:

```bash
cd ../hamdaz-2.0
.venv/Scripts/python.exe -c "import app, json; from app.main import app as a; print(json.dumps(a.openapi()))"
```

## What is read-only, and why it looks that way

Three modules are windows onto systems that own their data, and the screens say
so rather than implying an edit that would fail:

- **Proposals** — SharePoint is where the work happens. Every task links out.
- **Quotes** — Zoho Books. The refresh token is scoped to reads.
- **Directory** — Entra. Nothing here is edited in Hamdaz.

Quote comparison is the exception: it writes, and its "new" flow is three
deliberate steps — read the documents, **check what was read**, then compare.
The middle step is not collapsible, because the extractor is a model reading a
PDF and a misread unit price is the one mistake that costs real money.

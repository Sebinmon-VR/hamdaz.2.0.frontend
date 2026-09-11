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
      layout.tsx          the shell — frame, doodles, top bar, tabs, session
      dashboard/          overview
      teams/              list, detail, members, team dashboard, team proposal work,
                          team reports
      directory/          Entra, list and person
      leave/              mine, request, calendar, HR queue, rules
      proposals/my-tasks/ SharePoint tasks assigned to the viewer
      projects/           my work, every project, one project, its plan,
                          the portfolio, and what moved over a period
      reports/            what each team files — mine, new, one report, the overview
      quotes/             Zoho Books, list and detail
      comparisons/        list, new (upload → check → compare), saved detail
      assignment/         labels, the policy, who would get what, and the ranking
      assistant/          the chat agent, and hands-free voice mode
      admin/              roles, assignments, team access, user administration
      admin/assistant/    its switches, permissions, audience, runs and cost
      admin/reports/      who filed reports are mailed to, what each team files, what was sent
      admin/console/      the parts that run on their own, and what each currently says
      admin/intake/       mail in, work assigned — the pipeline, the mirror, the ranking
      admin/permissions/  who may do what in those parts, and who holds each role today
      notifications/      what you have been told
      settings/           accent palette and light/dark, per browser
  components/
    ui/                   primitives, controls, feedback — the design system
    shell/                top bar, tab strip, doodles, wordmark, theme switch
    widgets/              one renderer per backend dashboard widget
    assistant/            the orb, the two voice screens, the tool trace, the confirm card
    projects/             the RAG dials, the milestone timeline, the vocabulary
    comparison/ leave/ proposals/ quotes/   module-specific pieces
  lib/
    api.ts     the only place that talks to the backend
    types.ts   transcribed from the backend OpenAPI document
    session.tsx  who is signed in and what they can reach
    tabs.tsx   the open-tab strip
    theme.tsx  accent palette + light / dark / follow-the-system
    nav.ts     the pill bar, the overflow menu and the tab labels
    format.ts  dates, money, names
    hooks.ts   useAction, useDebounced
    assistant.ts  the SSE client and one conversation's state
    speech.ts     dictation in the browser, playback from the server
    realtime.ts   the spoken conversation: WebRTC straight to OpenAI
```

## The design

Archivo throughout, a rail down the left, and a column of blocks on the app
ground with a 16px gutter. Nothing is a card with a border.

**The shell.** [layout.tsx](src/app/(app)/layout.tsx) is a rail, a row of tab
chips, and one scroll container. Navigation is vertical
([Rail.tsx](src/components/shell/Rail.tsx)) for a reason that is arithmetic:
the top of a screen is where the title, the path, the filters and the actions
all want to be, and a nav bar there costs every screen 56 vertical pixels it
cannot spare. On the side it costs 62 horizontal pixels of a 1440-wide window,
which no screen misses.

Every screen owns its own command bar — that is what `PageHead` renders: the
display title, the route as a path pill read straight off the URL, a count, the
actions, and whatever the screen wants to say about where its data came from.
It is `sticky`, so it costs no vertical room while scrolling. The shell holds
no per-screen state at all.

**Blocks.** 20px corners, no border, floating on the ground. How a block
separates from that ground is decided once, by `--lift`: nothing in dark (the
ground is darker than the block), a soft shadow in light (they are both pale).
One class, two behaviours.

**Surfaces.** The app ground, the panel, and — for exactly one thing — the
**sheet**:

```
app  →  panel  →  panel-2  →  sheet
```

The sheet is the record surface: white on dark, a tinted well on light. It is
the only inversion left in the design, and it is reserved for *one record*, not
for a list. `Panel tone="sheet"` also carries `.on-sheet`, which redefines the
surface variables locally — so markup nested inside it re-inks without knowing
it is on a sheet, which is the whole reason those are variables.

`tone="slab"` and `tone="well"` still exist and still work: the pre-shell design
put every working list on a white slab, and rather than rewrite two dozen
screens' markup — and risk dropping a field on the way — those names now resolve
to the new surfaces.

**Selection inverts.** The selected row breaks its surface: white on dark, ink
on light (`--row-bg` / `--row-ink`). Same move, opposite direction, so the row
that matters reads first without a border, a bar or an accent.

**One accent per screen.** `AccentSlab` names the single thing a screen exists
to answer, and it runs off the right edge of its column — only the leading
corners are cut — because a slab that stops neatly inside the gutter reads as
another card. The accent is used nowhere else on that screen: used twice, it
stops meaning "this one". `HeroPanel` used to wear a decorative accent aura and
no longer does, for that reason.

**Type.** Three settings do all the hierarchy. `.display` is the screen title
and the slab — 800 weight, -0.04em, uppercase. `.fig` is every number — 700,
-0.03em, tabular. `.micro` is the 9px uppercase label at 0.19em that sits over
each one. The contrast between the widest tracking and the tightest is what
separates a label from a value, so neither needs a rule, a box or a colour.

**Colour.** Two axes, both stamped on `<html>` by [theme.tsx](src/lib/theme.tsx):
`data-palette` (electric · magenta · acid · ember) and `data-theme` (dark ·
light). "Follow the system" is resolved to a concrete mode in JS before first
paint, so `globals.css` never carries a `prefers-color-scheme` duplicate of
every block — that keeps it to four accent blocks, eight neutral blocks and two
surface blocks instead of twenty-something.

An accent never changes value between modes. It is always a **fill carrying
dark ink**, never body text, so it needs no duller variant to stay legible —
which is also why the app reads as one product in both modes rather than two.
`--accent-soft` and `--accent-text` are derived with `color-mix`, so adding a
fifth palette means adding one accent block and nothing else.

**The ramp.** Every bar and meter runs accent → second, so a length reads as a
position on one continuous scale instead of a legend lookup. `RampBar` slices
that gradient per segment, so adjacent segments *continue* it rather than
restarting, and each prints its own value inside its rounded end. Series with
an urgency order are laid out least-urgent first, which puts the second colour
— the one that already means "now" — at the late end.

**Doodles.** [Doodles.tsx](src/components/shell/Doodles.tsx) sits at `z-index:
-1` inside the frame, which sets `isolation: isolate` — above the app's own
background, below every block in flow, so no block needs a z-index of its own.
Strokes are `currentColor`, so the same drawing inks itself white on dark and
black on light; `--doodle` carries a different opacity per mode because white
on near-black reads weaker than black on off-white.

## Choosing a theme

[/settings](src/app/(app)/settings/page.tsx) is where a person picks their
accent and their light/dark mode. Each palette card previews itself in its own
real values — swatches, a filled pill, the ramp — so the choice is made by
looking rather than by reading.

The choice is stored per browser, not per account: the backend has no
user-preferences endpoint, and this is the kind of setting that genuinely
differs between someone's laptop and the shared machine in the workshop. The
sign-in screen carries a cut-down light/dark switch so the door matches the
room.

## Speed

The things that were actually slow, and what was done:

- **The session waterfall.** `/auth/me` used to gate the other four session
  calls, putting a guaranteed second round trip in front of every cold load.
  All five now fire together — they authenticate from the same cookie, so
  gating bought nothing.
- **SharePoint in the shell.** The "what's due today" rail lived in the top
  bar, so its SharePoint list sweep — the slowest call in the app — ran on
  *every* page. It now lives on the dashboard alone.
- **The font.** Outfit is self-hosted via `next/font` instead of a
  render-blocking Google stylesheet, which also removes a DNS lookup and a TLS
  handshake to a third origin before first paint.
- **API preconnect.** The root layout warms the connection to the API origin,
  so the shell's first call does not also pay for the handshake.
- **Navigation.** A 30s SWR dedupe window means returning to an open tab serves
  from cache without a request.

What is still slow is the backend's own remote reads — a team dashboard renders
Graph and SharePoint live, and the comparison analyse step calls a model. Those
show progressive skeletons rather than blocking the page.

## Two traps in the API

**`team` is not one convention.** Four modules take a query parameter of that
name and disagree on what goes in it:

| Endpoint | `team` is |
| --- | --- |
| `/assignment/preview`, `/labels…` | the team's **UUID** |
| `/analytics/…`, `/proposals/workload`, `/proposals/team-tasks` | the team's **slug** |

Sending the wrong one fails as a 422 about an "invalid character" — nothing in
that message names the real problem. `withQuery` in [api.ts](src/lib/api.ts)
therefore checks the shape against the path and throws a readable error in
development, where the call site is still in front of you.

**`excluded_roles` is applied by the ranking and ignored by the preview.**
`/analytics` drops anyone holding an excluded role; `/assignment/preview`
decides exclusion from labels and capacity alone and never looks at a role. So
a manager appears on *Who gets what* with a full share and is then absent from
*Ranking*, and the preview's shares are larger than what would actually be
handed out.

This is a backend inconsistency, not something the frontend should quietly
paper over by inventing its own rule — a guess here could diverge from what the
server does. So the preview marks the affected rows and says plainly that the
ranking will drop them, reading `excluded_roles` from the same policy rather
than deciding anything itself. **Worth fixing server-side** in
`app/assignment/router.py`, where the preview builds its `EffectOut` list.

## Which modules are actually gated

Only two routers enforce a team grant: **proposals** and **quote comparison**,
both with a `require_module` dependency. Everything else — leave, quotes,
labels, the assignment policy, the ranking — takes `CurrentUser` and checks
nothing further, and each says so in its own docstring. Being in the module
catalogue gives a module a route and a name; it is not what gates it.

So `ALWAYS_OPEN` in [session.tsx](src/lib/session.tsx) lists **leave, quotes
and assignment**, and the nav shows them regardless of grant. Hiding the
assignment screens behind one would have directly defeated the reason their
router gives for being open.

**Team proposal work is the exception to both.** `/teams/[slug]/proposals` shows
every member's individual tasks, and `/proposals/team-tasks` behind it is gated
on neither a module grant nor the global admin role. It asks a third question:
does the caller have authority over *this* team — an administrator, or that
team's own `team_lead` or `team_manager`. A lead is refused on every other team,
which is what makes the team-scoped roles worth holding.

So the link to that page is gated the same way, from `session.teams`, and not on
`can("proposals", "team_tasks")` as it used to be. That asked whether the
*viewer's* team holds the proposals module, which is neither necessary nor
sufficient: it hid the page from the lead it was built for and offered it to
ordinary members, who got a 403.

The page also no longer reads `/proposals/workload`. That endpoint is
`AdminUser`-only, so the one screen named after a lead's team was the one screen
they could not open.

Writes are a separate question and stay gated: label edits need a super admin,
the CEO or a manager; policy edits follow the reach rule; the HR queue checks
team membership. In each case the backend decides and the UI reports what it
said.

## Navigation is not a static list

The backend's module catalogue (`app/access/catalogue.py`) already names every
frontend route — deliberate on its side, so one catalogue drives both the
permission model and the navigation. `lib/nav.ts` adds only an icon, an
order, and the split between the pill bar and the overflow menu behind the grid
button; what appears comes from `/access/me`, so nobody is shown a link that
would 403.

Two exceptions, both matching the backend's own comments: **Leave** and
**Quotes** are open to every signed-in person — their endpoints check nothing
beyond a session — so `lib/session.tsx` adds them back after the grant-driven
list. Admin screens are gated on the global role instead, because admin-only
modules are never granted to a team. The HR-only leave screens appear by
comparing the viewer's teams against `hr_team_slug` from `/leave/settings`, so
HR sees a queue rather than a 403.

## Work assignment

Two backend modules, three screens, and **nothing on any of them assigns work**
— the backend is explicit that the scoring which acts on these settings is a
separate piece, so the ratios can be set up and argued about before anything
starts moving.

- **[Labels](src/app/(app)/assignment/labels/page.tsx)** — the catalogue and
  who holds what, on one screen, because making a label and giving it to
  somebody is the same task. Some labels are *derived*: On Leave is read live
  from the leave module, New Joiner from a joining date. Those show with their
  reason attached and no remove button, since the honest answer to "why does
  she have this" is a date, not a person. A label can be renamed and restyled
  but its **key cannot change**: the policy, every assignment and every stored
  run refer to it, so the edit dialog shows the key greyed rather than omitting
  it, and a built-in label's *kind* is fixed because the policy reasons about a
  seniority and a status differently.
- **[Policy](src/app/(app)/assignment/policy/page.tsx)** — a capacity
  multiplier per label, an optional hard ceiling on open items, who is out of
  the pool, and the three weights the scoring balances. The organisation has a
  default; a team can be given its own or dropped back to inheriting.
- **[Preview](src/app/(app)/assignment/preview/page.tsx)** — the policy read
  against the labels people actually hold. The backend returns a ratio in words
  ("1 task for every 2") next to the decimal, and the screen leads with the
  words: 0.7 is precise and means nothing at a glance.

- **[Ranking](src/app/(app)/assignment/ranking/page.tsx)** — the scoring that
  acts on all of it. Three factors — load against capacity, raw open count, and
  days since last assigned — each normalised across the candidates to 0–1 where
  1 always means most deserving, then weighted and summed. Every person's score
  can be opened to see the three contributions that produced it.

  Two endpoints, and the split is the design. `/preview` computes and keeps
  nothing, which is the common case. `POST /runs` computes and **freezes the
  policy onto the record**, so a later edit to the weights cannot rewrite what
  a decision was based on — which is why [a kept
  run](src/app/(app)/assignment/runs/[id]/page.tsx) never re-scores and shows
  the snapshot instead of the live policy.

  A team is required and must have a policy **of its own**; the organisation
  default deliberately does not qualify, since scoring everybody at once would
  put every team into a queue they do not share. A 409 here is therefore a
  setup answer, not a failure, and is shown as one with a link to the policy.

Reading all four is open to **any signed-in user** — their routers take
`CurrentUser` with no module guard, because the rule deciding how much work
somebody gets should be visible to the person it applies to. Writing is gated
by the backend's reach rule (super admins and the CEO anywhere, a manager only
on their own teams), and `PolicyOut.may_edit` carries the answer per policy, so
the UI reports the real refusal rather than guessing at it.

**Nothing in this module assigns anything.** The backend is explicit about it
twice: the policy screens set numbers, the ranking says who *should* get the
next task and why, and handing it over stays a person's action. Nothing is ever
written back to SharePoint.

## Projects

Internal work with a plan, kept deliberately apart from proposals: a proposal
is a bid the presales team works in SharePoint, a project is work this system
owns end to end. Six screens, and three ideas from the backend shape all of
them.

**Assignment is the visibility model.** Being on a project is what makes it
yours to see; holding a task inside it is what makes that task yours to move.
Assigning somebody a task adds them to the project, so there is one answer to
"who can see this" rather than two that can disagree — and no screen here asks
the question a second time. The listing narrows itself: the projects you are
on, all of your team's if you run it, everyone's if you run the company. A
project you may not read answers **404, not 403**, because a 403 on an id
confirms the id names a real project of some team.

**Three powers, kept apart.** Running the plan (`can_manage`), administering
the record (`can_administer` — archive, restore, delete) and filing a status
report on it (`can_report`) are separate, and moving one task is a fourth,
answered per task by `can_update`. All four arrive on the payload and the
screens read them rather than re-deriving them: an engineer records progress
on what they hold without being able to reschedule anything, which is the
distinction between a plan and a shared document. The backend refuses the
difference explicitly, so a control offered to the wrong person would fail
loudly — which is why none of them are offered.

**Health is judged, not computed.** The five dials are the lead's assessment
and are stored as such; what the module computes is a *suggestion*, sent
alongside. [`Dials`](src/components/projects/ProjectBits.tsx) draws both and
never merges them, and shows the suggestion only where it disagrees —
agreement is not news, and a tile arguing with its own lead on every project
would teach people to ignore the line. `health_stale` is surfaced everywhere
the colours are, because a green project nobody has looked at for a fortnight
is not evidence of a green project.

Two consequences worth knowing when reading the screens:

- **The milestone timeline draws the baseline as well as the current date.**
  The gap between them is the slip, and a chart that redrew itself around each
  reschedule would erase the only evidence that anything moved. The bar fills
  with *completion*, not elapsed time — filling it with the calendar would
  show every overdue milestone as finished.
- **`/projects/activity` is day, week, month, quarter and year in one screen**,
  because on the backend they are one query with different bounds. Nothing
  here computes a window: a grain goes up and the dates actually used come
  back, so the heading prints the period that was covered rather than the one
  somebody meant.

Writes revalidate the whole module — `/projects` is the second prefix in
`REVALIDATE_AFTER_WRITE` in [api.ts](src/lib/api.ts) — because moving one task
changes the task, its milestone's percentage, the project's roll-up, the
board, the portfolio and the log at once, and enumerating that at every call
site is how one gets missed. It is affordable here where it would not be for
proposals or quotes: projects is Postgres end to end and sweeps nothing.

## Project status reports

The reports module grew a second frame rather than nine sections everybody
has. A template declares which sections it carries, `scope` is **inferred from
those sections** rather than stored, and the report form endpoint answers with
it — so a team pointed at a project template is asked which project before
anything else, and gets health dials and a milestone timeline in place of some
of the standard six.

That needed no new mechanism: which template a team files has always been a
schedule row per cadence. `Switch a team to project reports` on
[admin/reports](src/app/(app)/admin/reports/page.tsx) writes the rows an
administrator would write by hand, reusing the existing ones so recipients and
notes survive the change. Two cadences arrived with it — **quarterly** and
**yearly** — and there is deliberately no daily project report.

The three new section kinds (`dials`, `timeline`, `projects`) are drawn from
the report's own `project_lines`, which is a **snapshot taken when the draft
was opened and then frozen**. The author owns exactly three boxes per project
— key activities, the management action required, and a note — and the
backend refuses everything else, so the editor offers nothing else: a report
whose figures could be retyped would be a record of what somebody wished the
project said. Following `project_id` is how a reader reaches the version that
has moved on since, and that link is the only live thing on a filed report.

## The assistant

A chat agent over the ERP's own modules, run **as the person asking**. That
phrase is the whole access model and it decides most of what this UI looks like:
a tool call is an HTTP request to the real endpoint carrying the caller's own
session cookie, so whatever that route refuses the assistant is refused too, and
no policy can hand anybody a right they did not already hold.

Six screens. One is the assistant; five are its administration.

| Screen | What it is |
| --- | --- |
| [/assistant](src/app/(app)/assistant/page.tsx) | The chat, its history, and both voice screens |
| [/admin/assistant](src/app/(app)/admin/assistant/page.tsx) | The master switch, the model, the limits |
| […/permissions](src/app/(app)/admin/assistant/permissions/page.tsx) | What it may read and write, per module and per tool |
| […/access](src/app/(app)/admin/assistant/access/page.tsx) | Who it is released to |
| […/runs](src/app/(app)/admin/assistant/runs/page.tsx) | Every turn anyone has taken, with its full log |
| […/analytics](src/app/(app)/admin/assistant/analytics/page.tsx) | Usage and cost |

**It is off until somebody turns it on.** `enabled` defaults to false on the
backend, deliberately — an assistant nobody has configured should reach nobody,
super admins included. So a fresh install shows "The assistant is switched off"
on `/assistant` until `/admin/assistant` has been visited, and that is the
expected first experience rather than a fault.

**The five admin routes are super admin only, and that is narrower than it looks.**
The backend does not use its usual `ADMIN_ROLES` here: a CEO or a manager gets a
403 on every one of them, on the stated grounds that deciding what an assistant
may do on everybody's behalf is a different question from running a team. Each
screen therefore gates on `is_super_admin` rather than `is_admin`, which is what
those endpoints will actually say.

### Streaming, and why it is fetch rather than EventSource

Sending a message answers with Server-Sent Events, not JSON — a turn calls tools
as it goes and can take a while. `streamTurn` in
[assistant.ts](src/lib/assistant.ts) does the reading, with `fetch` for two
reasons that are both requirements: `EventSource` cannot POST, and the message
has to go in a body; and it cannot be aborted in a way that leaves the caller in
control.

The parser buffers until it sees a blank line rather than working line by line.
A frame can be split anywhere by the network, and anything less drops half a
token eventually — which is the kind of bug that shows up as a word missing from
one answer in fifty.

**Stopping is not cancelling, and the button says so.** The backend runs a turn
in a background task and the HTTP response merely watches a queue — deliberately,
because a turn that died with the connection *after* it had already made a write
would be worse than one that finishes unwatched. So the stop button detaches the
screen, says the turn is still finishing, and offers a refresh. Actually
cancelling a run is a super admin action and lives on the runs screen.

### The three things that make an agent legible

**The tool trace.** Every call is shown as it happens — what was asked for, what
came back, and how long it took. Refusals stay on screen rather than vanishing
once the answer arrives, because the backend returns a 403 naming who *is*
allowed and the model is told to pass that on. An answer is only as good as what
the asker was permitted to read, and hiding that would leave somebody unable to
tell a complete answer from a narrow one.

**The confirmation card.** A write the policy says must be approved parks the
whole run as `awaiting_confirmation`; nothing has happened when the card appears,
and the loop resumes from exactly that point on an answer. So the card *is* the
action, not a notice about one — which is why it shows the arguments in full
rather than the model's summary of them. Where the two disagree, the arguments
are what will be sent. Declining is not an error: the model is told the person
said no and gets to respond, so both buttons carry the conversation on.

**The effective column.** On the permissions screen a tool's own switch, its
module's, and the global default fold together, and a per-tool override is easy
to get wrong without seeing the answer they produce. Every row shows what a turn
would actually be given, not what was set.

Two more states share that screen, and both are marked rather than left to be
inferred. A **planned** tool is a roadmap entry: in the catalogue, offered to
nobody, and unreachable however the switches are set — so its switches are
replaced by a note, which is what stops somebody toggling them and wondering why
nothing changed. A **deferred** tool is live but kept out of the prompt until the
model searches for it: with ninety-odd tools, sending them all would cost tokens
on every "hi" and, worse, cost attention. The header therefore counts what the
model is actually carrying — so many in the prompt, so many a search away —
because that number explains more about a given answer than the total does.

### Voice

**Heard in the browser, spoken by the server**, and the asymmetry is the
backend's decision rather than an accident of what was easy.

Listening is the browser's. There is no speech-to-text endpoint, nothing from
the microphone is uploaded or stored, and the assistant receives exactly the
text a person would have typed. `SpeechRecognition` is a Chrome, Edge and
Safari feature that **Firefox does not ship**, so every screen has to work with
the microphone missing — the hands-free button is hidden rather than broken
where it is.

Speaking is the server's. Answers are read by an OpenAI speech model through
`POST /assistant/speech`, steered by a voice and a sentence of direction a super
admin sets under [the voice panel](src/app/(app)/admin/assistant/page.tsx). The
backend spells out why it is not `speechSynthesis`: the built-in voices are
whatever the operating system ships, they differ on every machine, and on most
of them the reading is flat enough that people stop pressing the button. This
sounds the same for everyone.

Three consequences the UI has to carry, all in [speech.ts](src/lib/speech.ts):

- **It is fetched a sentence at a time**, with the next requested while the
  current one plays. Generating a whole paragraph before any sound arrives feels
  broken even when it is quick; a short first clip gets a voice into the room and
  the rest arrives under cover of playback.
- **The browser voice survives only as a fallback** — the voice switched off, no
  API key, a laptop with no connection. A worse voice beats silence. It is never
  used for a *sample*, where the whole question is how one particular voice
  sounds, and answering that with a different one answers nothing.
- **It is billed per character**, unlike the browser's, which was free and local.
  So reading an answer in the chat is a button on that answer, not something that
  happens on its own. The hands-free screen is where speaking is the default,
  because there it is the entire point.

Two questions the chat asks separately, because they now have different answers:
talking to it needs a microphone and so is unavailable in Firefox, while hearing
it back needs nothing of the browser and is offered wherever the voice is on.

The voices are **unlabelled on purpose** in the admin panel. How one sounds is
not a judgement anybody should make from a name, and the backend says exactly
that where it lists them — so each has a play button and they all say the same
sentence, which is the only way to choose. Sampling a named voice is a super
admin power that the speech endpoint enforces itself.

The [voice screen](src/components/assistant/VoiceOverlay.tsx) is a **loop, not a
mode**, which is the difference between a voice assistant and a dictation box:
listen, send at the natural end of the utterance, read the answer back, listen
again. Nobody taps between turns, because a hands-free interface that needs a
hand is not one. Three things break the loop and nothing else does — the person
pausing it, a write that needs approving, or an error.

Two details there are load-bearing:

- **It stops listening while it talks.** Without that the spoken answer returns
  through the microphone and the assistant answers itself, which is the
  characteristic failure of a naive build of this.
- **A spoken "yes" can approve a write, and an unclear answer cannot.**
  `yesOrNo` returns null for anything ambiguous and the card stays up. The lists
  are short and matched on whole words, so "now", "nothing" and "yesterday" are
  none of them an answer — a misheard approval is the one mistake on that screen
  that cannot be taken back.

The [orb](src/components/assistant/Orb.tsx) is a canvas rather than decoration.
A voice interface has no cursor and no button being pressed, so how it moves is
the only thing saying the machine is hearing you — it is driven by the real
microphone level at sixty frames a second, which is also why it is not React.
It draws in the app's own accent → second ramp, read from the CSS variables, so
it follows the palette and the mode like everything else. Reduced motion stops
the idle wobble and the rotation but **not** the response to the microphone,
because that part is information.

### The spoken conversation

There are **two spoken modes and they are different arrangements**, not two
settings for one feature. Which one the Talk button opens depends on what a
super admin has switched on.

*Reading an answer aloud* is this app's loop, described above: the browser
transcribes, the text chat answers, a speech model reads it back. Three of our
turns per exchange, and every one of them passes the same checks a typed turn
does.

*A spoken conversation* is **OpenAI's** loop. The browser opens a WebRTC
connection straight to them, streams the microphone into it, and hears speech
back with nothing of ours in between. That is what lets somebody interrupt it
mid-sentence and what makes it feel like a conversation rather than a
walkie-talkie. It lives in [realtime.ts](src/lib/realtime.ts) and
[its own screen](src/components/assistant/RealtimeOverlay.tsx), separate from
the dictation screen because almost nothing about the loop is shared.

Two rules keep it inside the same access model as everything else, and the
frontend enforces **neither** of them, which is the point:

- **The session is furnished on the server.** Model, voice, instructions and the
  tool list are all fixed when the ephemeral token is minted, so the browser
  receives a key to a room it did not decorate. The client sends exactly one
  `session.update`, asking only that what the person says be transcribed so the
  screen can show it — it adds no tool and changes no instruction, and it must
  stay that way. A client that could redefine its own session would make the
  whole arrangement theatre.
- **Tools never execute in the browser.** A call from the model is relayed to
  `/assistant/realtime/call`, which resolves that person's policy again and runs
  it through the same route as the text chat with their own session cookie. The
  browser learns that a tool is called something; it never learns where it lives.

**Confirmation is genuinely weaker here, and both the code and the screen say
so.** In the chat, a write that needs approving parks the run and nothing
happens until somebody answers. In a spoken conversation the server refuses the
write once and tells the model to ask out loud; the model asks, hears an answer,
and calls again — and it is the client that marks the second call confirmed. The
judgement of "they said yes" is the model's. That is why
`realtime_writes_enabled` is its own switch, off by default, and why a waiting
write is put **on screen** as well as spoken: saying yes is the ordinary way
through, but somebody should be able to see what was asked, in full, and refuse
it without having to out-talk it.

Three consequences worth knowing when reading the code:

- The card is cleared **by tool, not by call id**. The retry after somebody says
  yes is a new call with a new id, and matching on the id left the card on
  screen for the rest of the conversation, asking about something that had
  already happened.
- Everything the connection owns is torn down together. A half-closed peer
  connection keeps the microphone light on, which is the one bug in that file
  somebody would notice from across the room.
- Its cost **does not appear on the usage screen**. OpenAI bills a realtime
  session directly and does not report usage back, so the run exists for the
  audit trail but its tokens and cost do not.

`/assistant/voices` serves the realtime model list alongside the speech ones, so
the admin screen keeps no copy of its own to fall out of step.

### Where the answers are rendered

The model writes markdown — it is told to prefer short lists — so
[Markdown.tsx](src/components/assistant/Markdown.tsx) renders the grammar it
actually produces: paragraphs, bullets, numbered lists, bold, inline code and
fences. It is forty lines rather than a dependency, and **it never produces
HTML**: every branch returns React elements, so a tool result echoing markup back
through an answer is text and can never be anything else. Unsupported syntax is
left as the characters that were written.

### Navigation

`/assistant` is on the rail for **everybody**, and that is deliberate. Its
catalogue entry on the backend says in so many words that it is listed "for
navigation" and that who may use it is decided by the assistant's own access
rules, which a super admin sets, not by a team grant — so gating the link on a
grant would gate it on the one thing the backend says does not gate it. The
screen asks `/assistant/status` instead, which answers with a sentence saying
why whenever the answer is no: switched off, not released yet, blocked, or over
one of the caps. Each of those is shown as written.

Two of the five admin screens are on the rail; all five carry
[a strip](src/components/assistant/AdminNav.tsx) linking the others. Five
near-identical rail rows would crowd out everything else an administrator does.

## Widgets

`/dashboards/me` and `/teams/{slug}/dashboard` return widgets the backend has
already rendered — key, size, and a `data` payload whose shape depends on the
key. `components/widgets/index.tsx` is the switchboard. A widget with no
renderer falls through to its raw JSON rather than vanishing, so adding one on
the backend is never a silent no-op here. A widget that cannot answer returns
`{available: false, reason}` and is rendered as that reason in place.

## API coverage

Every endpoint the backend exposes is called by some screen, bar three that are
redundant here and deliberately left alone:

| Endpoint / field | Why not |
| --- | --- |
| `GET /projects/my-tasks` | The viewer's own project tasks. `/projects/board` returns the same list plus the projects they belong to and the portfolio figures, as one call — three round trips to draw one screen is how a dashboard earns a reputation for being slow. |
| `GET /widgets` | The unscoped widget catalogue. The layout dialog uses `available` from `/teams/{ref}/dashboard/layout`, which is the same list already narrowed to that team's modules. |
| `DELETE /teams/{ref}/access/{module_key}` | Revokes one module. The access screen sends the whole set with `PUT`, where a module left out *is* the revocation. |
| `POST /teams/{ref}/access` → `page_keys` | Grants one module limited to some pages. The `PUT` above carries the same per-module page lists for every module at once. |
| `GET /auth/callback` | A browser redirect target, not something a fetch should ever hit. |

Thirteen response fields are also deliberately not rendered, and all of them
are the same two kinds of thing: opaque identifiers the screens already have a
better handle for (`created_by_id`, `decided_by_id`, `policy_id`,
`sharepoint_lookup_id`, `sharepoint_user_id`, `team_slug`) and server telemetry
(`widget_ms`, `section_ms`, `fetch_ms`, `SectionInfo.heavy`, which the
progressive loader acts on rather than displays).

**The finance module has no screens at all.** Seven endpoints — the profit and
loss, its comparison and trend, account postings, the Zoho passthrough and its
diagnostics — are unbuilt here rather than deliberately skipped, and are the
one real gap in this table. The two `careers` routes and `/apply/{token}` are
also absent by design: they are public, unauthenticated pages for candidates
and belong outside this app shell.

Every other endpoint, **every query parameter and every request field** is sent
by some screen. To re-check after a backend change, dump the spec (below) and
diff its paths, `parameters[].name` and request-schema properties against the
string literals under `src/`.

### Loading fast, then completely

Three endpoints take `local_only`, which tells the backend to skip the sections
or widgets that call out to Entra and SharePoint. Those remote reads are what
make a dashboard take seconds; the rest answers from Postgres in milliseconds.
`useProgressive` in [hooks.ts](src/lib/hooks.ts) fires both **in parallel** —
sequencing them would add the fast one's latency to the total for no benefit —
renders whichever has arrived, and swaps in the complete answer when it lands.
Used by the overview, each team dashboard, and the admin profile.

One consequence worth knowing when reading those screens: a section can be
`undefined` (not arrived — the local pass skipped it) or `null` (arrived, the
person genuinely has no Entra record). Only the second is worth reporting to
the viewer, so the distinction is load-bearing.

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

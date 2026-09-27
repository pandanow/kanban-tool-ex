# Table view for Kanban Tool

A Monday.com-style **Main Table** view for [Kanban Tool](https://kanbantool.com) cloud
boards: one row per card, one column per field, grouped and collapsible, with inline
editing that writes straight back to the board.

## Why it is built this way

Kanban Tool cloud is closed-source SaaS, so this is not a change to the product. It is a
**Kanban Tool SDK extension**: a single JavaScript bundle loaded into board pages by the
*Developer Tools* power-up.

That choice buys three things a standalone app built on the REST API would not have:

- **No API tokens.** The script runs inside the user's own authenticated session.
- **Live data for free.** The board's cards are already in the page as Backbone models,
  kept in sync by Kanban Tool. An edit made on the board, in this table, or in someone
  else's browser shows up everywhere.
- **The product's own permissions.** Every cell is gated on `KT.currentUser.can(...)`.

The cost is that the SDK has no official "custom view" extension point, so mounting a
full-board alternate rendering means overlaying markup Kanban Tool makes no promises
about. That risk is deliberately confined — see [Fragile points](#fragile-points).

## Getting started

```bash
npm install
npm test          # 210 tests, no browser or Kanban Tool account needed
npm run build     # -> dist/kt-table-view.js
npm run harness   # http://localhost:5180 - the real table against fake board data
```

`npm run harness` is the fastest way to see and click the thing. It installs the same
fake `KT` globals the integration tests use, then loads the real extension on top.
Add `?cards=5000` to check behaviour on a large board. The fake board includes
stand-in `<kt-task>` cards and a `<kt-taskview>` panel, so the ↗ "open card" handoff can
be exercised there too.

## Deploying it

### 1. Pilot on one board

No hosting needed. On a board you own, enable **Settings → Power-Ups → Developer Tools**
(account owner or admin only), and paste the contents of `dist/kt-table-view.js` into the
custom JavaScript box.

**Check what is actually running.** Every build stamps its version and time into the
bundle, and the first console line on a board says which one is live:

```
[kt-table-view] table view ready (build 0.1.0+2026-09-27T21:15:30Z)
```

`KTTableView.inspect()` prints the same stamp first. If it does not match the build you
just pasted, the save did not take and the board is still serving the previous script -
which it does silently. Saving the box has been seen to answer **500**; when that happens
nothing changes on the board, so check the Network tab for the failing request rather
than the extension. A paste that will not save can be bypassed by pasting the one-line
bootstrap below instead and hosting the bundle, which is also the faster loop.

### Loading it from a URL instead

The Developer Tools box also takes a URL, which avoids pasting 58 KB every time. The host
has to serve a **JavaScript content type**, and `raw.githubusercontent.com` does not: it
answers `content-type: text/plain` with `x-content-type-options: nosniff`, so Chrome
refuses to run it and the console says `net::ERR_BLOCKED_BY_ORB`. The file is fine; the
header is not.

jsDelivr serves the same file out of the same repo as `application/javascript`, and works:

```
https://cdn.jsdelivr.net/gh/<owner>/<repo>@<commit-sha>/dist/kt-table-view.js
```

Pin the **commit sha**, not `@main`. A branch URL is cached for 12 hours at the edge and
seven days in the browser, so a fresh push keeps serving the old bundle - exactly the
failure the build stamp exists to catch. A sha changes with every push, cannot go stale,
and the stamp in the console tells you which one you are running.

For a live-reload loop while developing, paste a bootstrap instead of the bundle. Kanban
Tool is served over HTTPS, so a `localhost` URL will be blocked as mixed content — serve
the build through an HTTPS tunnel:

```bash
npm run dev      # rebuild dist/ on save
# expose dist/ over HTTPS with your tunnel of choice, then paste this into the board:
```

```js
$.getScript('https://<your-tunnel>/kt-table-view.js')
```

### 2. Roll out account-wide

Host `dist/kt-table-view.js` on any static host that serves it as JavaScript (see the
content-type note above), then register it once:

1. Go to **Account Administration → Account settings**.
2. Open the browser console and run `$('.im_a_developer').show();`
3. Put the bundle's URL in the revealed pane and save.

The script then loads on every board in the account. CSS is inlined into the bundle, so
the JavaScript URL is the whole deliverable — there is no second CSS URL to register.

Boards without the Developer Tools power-up are unaffected, and on any page that is not a
board the script detects there is no `<kt-board>` and does nothing.

## Using it

- Open with the **Table** button — in the board header if a mount point was found, otherwise
  floating at the bottom right — or right-click the board → **Table view**.
- Close with **Back to board**, or Escape.
- Click a cell to edit it; Enter saves, Escape cancels. `Ctrl`/`Cmd`+Enter saves a
  multiline field.
- Click a column header to sort (ascending → descending → off). Blanks always sort last.
- Group by stage (the default, mirroring the board), swimlane, assignee, priority, card
  type, or any single-select or user custom field.
- Click the ↗ on a row to open that card in Kanban Tool's own task view, over the table,
  with the side panel the activity list and comment box live in.
  Closing the card leaves you back in the table; only if the card cannot be layered over
  it does the table step aside and show the board.
- An open card - from the board or from the table - gets a **Browse files** button beside
  its *Attachments* heading. It shows the
  card's image attachments as previews; click one to see it full size, and step through
  them with the ‹ › arrows or the arrow keys. Escape goes back one step at a time and
  never closes the card underneath.
- Tick rows to bulk-edit them in one request. Renaming is deliberately not offered in
  bulk, and fields a card cannot be without cannot be cleared in bulk.
- Search across every visible column, or click **Filters** for a filter box under each
  column heading. `is:empty` and `is:set` match blank and non-blank cells.
- Group-by, sort, filters and column choices are remembered per user, per board.

## How it fits together

```
src/
  index.ts          entry: inject CSS, KT.onInit, launch button + context menu
  kt/               everything that touches the host page or the KT global
    types.ts        typed shims for KT, Board, Task
    selectors.ts    EVERY host-page DOM selector, plus a load-time self-check
    store.ts        live view of one board; patches only rows that changed
    currentBoard.ts works out which board is on screen
    permissions.ts  delegates to KT.currentUser.can
    persistence.ts  per-user, per-board view preferences in localStorage
    openTask.ts     opens a card over the table, in KT's own task view
    taskFiles.ts    a card's image attachments, from the model or GET /api/v3/tasks/:id
  model/            pure, no DOM, no KT - the testable core
    columns.ts      derives columns from board settings + custom fields
    rows.ts         task attributes -> row values + display text
    format.ts       every value format the API documents
    values.ts       what the user typed -> what gets saved
    sorting.ts  filtering.ts  grouping.ts
  ui/               Preact components
    overlay.ts      mount over <kt-board>, restore it on close
    TableView.tsx   state, wiring
    Toolbar.tsx  Table.tsx  BulkBar.tsx  cells/Cell.tsx
    files.ts        the Files button on every open card, and its dialog's keys
    FilesDialog.tsx preview grid and full-size viewer
  edit/
    save.ts         one cell: optimistic write, rollback on rejection
    bulk.ts         many cells: KT.tasks.groupUpdate
```

Built with Vite into a single IIFE. The official Kanban Tool DevKit is deliberately not
used: it is a Ruby/Rake/CoffeeScript scaffold and offers nothing this needs.

## Fragile points

| What | Why it could break | What happens then |
|---|---|---|
| `src/kt/selectors.ts` | The board header markup is not a public contract | The **Table** button floats at the bottom right instead, which needs no knowledge of the markup |
| `src/ui/overlay.ts` | The board's rect gives the top edge only; its size is scroll content | Clamped to the viewport; an unusable rect fills the screen |
| `src/kt/openTask.ts` | No documented "open this task" call, and no documented depth for the layer the task view is painted at | The depth is measured from the task view element itself; if the card still cannot be got above the table, the table closes and the board is shown, which is what it always used to do |
| `src/kt/currentBoard.ts` | No documented way to read the on-screen board id | Four fallbacks; if all miss, the table says so instead of opening blank |

The board itself is only ever hidden and shown, never modified. The worst failure is
"the table did not open", not "the board is broken".

## Confirm on the pilot board

Seven things could not be verified without a real Kanban Tool account. Five are now
settled on the pilot board; the last two are the only `CONFIRM`s left in the source.

1. ~~**Board header selector**~~ — **confirmed**: the button goes in the navbar's
   `.top-right-pane ._links` group, beside Share / Settings / Help. Floats if absent.
2. ~~**Board id source**~~ — **confirmed**: `<kt-board data-board-id="…">`. Handled.
3. ~~**Task element id attribute**~~ — **confirmed**: `<kt-task data-task-id="…">`,
   which `ID_ATTRIBUTES` in `src/kt/openTask.ts` now tries first. The rest stay as
   fallbacks, and opening a card still logs which one matched.
4. ~~**The activity panel's selector**~~ — **confirmed**: `div.kt-taskview-sidebar`,
   a sibling of `kt-cover`, both fixed at z-index 1054. `PANEL_CANDIDATES` in
   `src/kt/openTask.ts` names it. Each surface found is logged (`card surface: …`) and
   each candidate turned down says why, so a future rename is one console line away.
5. ~~**The open card's element**~~ — **confirmed**: it is `<kt-taskview>`, it layers
   over the table, and closing it **hides** that element rather than removing it.
   `src/kt/openTask.ts` watches for every way of hiding one, and removal too.
6. **Custom field write formats** — the API docs specify read formats but not writes for
   `select`, `user`, `date` and multi-value fields. `src/model/format.ts` assumes a plain
   string, a user id, `Y-m-d`, and comma-separated values respectively. Edit one custom
   field of each type and confirm the value lands on the card.
7. **Attachments over the session** — the API docs only show bearer tokens, and list a
   card's attachments nowhere but `GET /api/v3/tasks/:id.json`. `src/kt/taskFiles.ts`
   calls that with the session's cookies. Open **Browse files** on a card with images; a
   refusal logs `attachments for task N: the API answered <status>` and the dialog
   says it could not load the files. The button's place is settled:
   `<kt-task-attachments>` was confirmed with `probeCard()`, and the heading beside it is
   found by its text. The console says once where the button went
   (`files button: beside the Attachments heading`), so a renamed heading shows up as
   one of the fallback lines.

## Notes from the first real board

Things that differ from what the SDK docs suggest, learned by running this on an actual
account. Each has a regression test in `test/integration/launcher.test.ts`.

- **`KT.Elements.Board.contextMenu` is not an array.** It has `push`, but calling any
  other array method on it throws. `src/ui/launcher.ts` treats it as "something with
  push" and tracks registration itself.
- **A throw during setup used to lose everything after it**, because setup runs inside
  `KT.onInit`. Every step is now independently guarded, so one broken integration point
  cannot take down the rest.
- **There is no board-level header.** Everything matching /header/ is either the page
  `nav.navbar` or per-column/per-card (`.kt-tasklist-header`, `.kt-task-header`) — a
  button there would appear on every card. The mount point is the navbar's
  `.top-right-pane ._links` group; the floating button remains the fallback.
- **The custom-theme extension hides `<body>` children it does not recognise.** With
  `kt-extensions-custom_theme-background` on `<body>`, our container computed
  `visibility: hidden` from a host rule that outranks a plain class selector - mounted at
  the right size, right position, right z-index, and simply not painted. `.ktv-root` now
  forces `visibility`, `display`, `position`, `opacity` and `z-index` with `!important`,
  and `test/styles.test.ts` fails if any of them is dropped. The z-index is also near the
  top of the range, since the host paints its own layers high.
- **An invisible element is not hit-testable**, so `document.elementFromPoint` falls
  through to whatever is behind it. That made the first version of the self-check report
  "painted over by `<html>`" when the real fault was CSS hiding us. `warnIfCovered()` now
  checks computed visibility before blaming occlusion, and names which of the two it is.
- **`<kt-board>` is the scroll content, not a viewport-sized pane.** On a real board it
  measures 2245 x 14708px. Sizing the overlay to that rect left almost all of the table
  off-screen and unreachable, so the overlay is clamped to the viewport: it starts where
  the board starts and ends at the bottom of the screen, scrolling internally. Page
  scrolling is locked while it is open.
- **`<kt-board>` carries `data-board-id`** (and `data-offset-top`), which settles how the
  on-screen board is identified.
- **Closing a card hides `<kt-taskview>`, it does not remove it.** So "is the card still
  open?" is a question about computed styles, not about the DOM tree: the element going
  away, `display: none` from anywhere, the host writing over the inline `visibility` we
  set, or a rect that has gone.
- **An open card is two body-level elements, neither of them inside the board.**
  `kt-cover` (fixed, z-index 1054) holds `<kt-taskview>`, and `div.kt-taskview-sidebar`
  (fixed, z-index 1054) holds the activity list and the comment box beside it. The table
  drops below the lowest of them, so both paint over it.
- **A loose panel selector finds the furniture.** `kt-side-panel-slide` is on the navbar
  pane, on the wrapper around the whole board, and on a fixed card legend at z-index 10 -
  and matching that legend would have put the table at z-index 9, underneath it. The
  candidates in `src/kt/openTask.ts` are named, not pattern-matched, and the fake board
  in the tests carries all three decoys so the mistake fails a test.
- **The keystroke that closes the card used to close the table too.** The host closes its
  task view on Escape, and the `MutationObserver` telling us so is delivered *between two
  listeners for that one keydown* - so our handler ran with the card already recorded as
  closed and took the table down as well, dropping the user two levels out to the board.
  The Escape handler now listens in the capture phase and treats a card that closed after
  the keystroke began as the owner of that keystroke (`taskViewOwnsEscape`), with a
  regression test that fails if either half is removed.
- **Hiding the board with `display: none` collapsed its parent**, so an overlay sized
  `absolute; inset: 0` inside that parent came out 0x0 and the table looked like an empty
  page. The board is now hidden with `visibility: hidden` (keeping its box, so it stays
  measurable) and the overlay is `position: fixed` on `<body>`, sized from the board's own
  rect and re-measured on resize. If that rect is ever unusable it fills the viewport
  instead of collapsing.

## Testing

`npm test` runs 210 tests with no browser and no account:

- **Model tests** cover column derivation from a board fixture with a custom field of
  every type, value parse/format round-trips, sorting per type, filtering, and grouping.
- **Integration tests** drive the real overlay against a fake `KT` global in a DOM:
  mounting and restoring the board, live updates arriving from the models, every editing
  path including rejected writes rolling back, permission-gated read-only cells, bulk
  updates, row windowing on a 2000-card board, and opening a card over the table - the
  layering, both shapes of task view, the side panel that comes with a card (including
  one that arrives late, and the page chrome that must never be taken for one), every
  way the host might close a card, the Escape race, why the board stays hidden, and each
  fallback to showing the board.

The fake in `test/integration/fakeKT.ts` is a faithful shape of the documented SDK, not a
mock of our own calls — if the real SDK differs, these tests are what should catch it.

## References

- [Kanban Tool SDK](https://kanbantool.com/developer/sdk)
- [Kanban Tool API v3](https://kanbantool.com/developer/api-v3)
- [Developer Tools power-up](https://kanbantool.com/support/developer-tools)

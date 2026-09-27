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
npm test          # 151 tests, no browser or Kanban Tool account needed
npm run build     # -> dist/kt-table-view.js
npm run harness   # http://localhost:5180 - the real table against fake board data
```

`npm run harness` is the fastest way to see and click the thing. It installs the same
fake `KT` globals the integration tests use, then loads the real extension on top.
Add `?cards=5000` to check behaviour on a large board.

## Deploying it

### 1. Pilot on one board

No hosting needed. On a board you own, enable **Settings → Power-Ups → Developer Tools**
(account owner or admin only), and paste the contents of `dist/kt-table-view.js` into the
custom JavaScript box.

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

Host `dist/kt-table-view.js` on any static host, then register it once:

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
    openTask.ts     hands a card to Kanban Tool's own task view
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
| `src/kt/openTask.ts` | No documented "open this task" call | The user is told to open the card from the board |
| `src/kt/currentBoard.ts` | No documented way to read the on-screen board id | Four fallbacks; if all miss, the table says so instead of opening blank |

The board itself is only ever hidden and shown, never modified. The worst failure is
"the table did not open", not "the board is broken".

## Confirm on the pilot board

Four things could not be verified without a real Kanban Tool account. Each is isolated,
commented `CONFIRM`, and cheap to correct.

1. ~~**Board header selector**~~ — **confirmed**: the button goes in the navbar's
   `.top-right-pane ._links` group, beside Share / Settings / Help. Floats if absent.
2. ~~**Board id source**~~ — **confirmed**: `<kt-board data-board-id="…">`. Handled.
3. **Task element id attribute** — `ID_ATTRIBUTES` in `src/kt/openTask.ts`.
4. **Custom field write formats** — the API docs specify read formats but not writes for
   `select`, `user`, `date` and multi-value fields. `src/model/format.ts` assumes a plain
   string, a user id, `Y-m-d`, and comma-separated values respectively. Edit one custom
   field of each type and confirm the value lands on the card.

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
- **Hiding the board with `display: none` collapsed its parent**, so an overlay sized
  `absolute; inset: 0` inside that parent came out 0x0 and the table looked like an empty
  page. The board is now hidden with `visibility: hidden` (keeping its box, so it stays
  measurable) and the overlay is `position: fixed` on `<body>`, sized from the board's own
  rect and re-measured on resize. If that rect is ever unusable it fills the viewport
  instead of collapsing.

## Testing

`npm test` runs 151 tests with no browser and no account:

- **Model tests** cover column derivation from a board fixture with a custom field of
  every type, value parse/format round-trips, sorting per type, filtering, and grouping.
- **Integration tests** drive the real overlay against a fake `KT` global in a DOM:
  mounting and restoring the board, live updates arriving from the models, every editing
  path including rejected writes rolling back, permission-gated read-only cells, bulk
  updates, and row windowing on a 2000-card board.

The fake in `test/integration/fakeKT.ts` is a faithful shape of the documented SDK, not a
mock of our own calls — if the real SDK differs, these tests are what should catch it.

## References

- [Kanban Tool SDK](https://kanbantool.com/developer/sdk)
- [Kanban Tool API v3](https://kanbantool.com/developer/api-v3)
- [Developer Tools power-up](https://kanbantool.com/support/developer-tools)

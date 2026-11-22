# Proposal: History Leaderboard

**Status: proposal. Not actioned, no code written.** Captured for review before building.

Scoped against the schema and views as they stand on **22 November 2026** — `src/history/duckdb/`,
`src/views/HistoryOverviewView.vue` and `src/history/export/tables.ts`. The DuckDB-WASM prepared
statement API was read from the installed `@duckdb/duckdb-wasm` types on the same date.

## Problem

The overview page answers "how much did I listen". It does not answer the first question anyone
actually asks of their own history: **what did I listen to most, and has that changed.**

The wanted shape is one page with three controls and a chart:

- **What to rank** — artist, song or album
- **How many** — 3, 5, 10, 15 or 25
- **When** — all time, a single year, or a custom range
- **A trend chart** — hours over time for the leading entries, so the table's standings have a shape

Artists and albums rank on the play counts of their songs, not on anything the export states about
them directly — the export has no artist or album rows, only strings on each play.

## Verdict

A new route, `/history/leaderboard`, reached from a second card in the overview's "Explore it" list.
Six parameterised queries — a leaderboard and a trend per entity — bound to a time range rather than
built as strings. Inline magnitude bars in the table, and an ECharts area chart below it.

```text
/history/leaderboard
  ← Back
  Top of the lot
  ( Artists | Songs | Albums )   Top [ 10 ▾ ]   When [ All time ▾ ]
  ─────────────────────────────────────────────────────────────────
   1  Radiohead    ████████████████████  1,284 plays   87.2 h
   2  Bonobo       ███████████████         976 plays   71.9 h
   3  Aphex Twin   ██████████              701 plays   52.4 h
   4  Four Tet     ████████                604 plays   44.1 h
   5  Burial       ██████                  512 plays   38.8 h

  Hours over time — top 5
  40┤              ╭──╮
  30┤        ╭─────╯  ╰──╮
  20┤   ╭────╯  ╭───╮    ╰──
  10┤───╯───────╯   ╰───────
   0└─┬─────┬─────┬─────┬─────┬
    2022  2023  2024  2025  2026
```

## Ranking metric

**Rank by play count; show hours as a second figure on each row.**

A "play" means the same thing it already means on the overview's **Real listens** tile: `kind =
'track'` and `ms_played >= MIN_PLAY_MS`. Reusing the existing constant rather than picking a new
floor is what makes the two pages reconcile — at the all-time range, the sum of every artist's plays
is the `heard_plays` figure, less plays whose track has no album-artist name. **That reconciliation
holds only at all time**; any narrower range breaks it by design, which is worth remembering when
the two pages appear to disagree.

Hours ride along because ranking by count alone quietly favours short songs: a 90-second interlude
played 400 times outranks a 9-minute track played 300 times, and the row showing `400 plays · 10.0 h`
next to `300 plays · 45.0 h` lets the reader see that for themselves.

No metric toggle. Three controls is already the budget; a fourth puts a sort-key branch into every
statement for a question the second column and the chart both answer.

## Time range

### The control

A single `<select>` of presets, plus one custom option that reveals two date inputs:

```text
All time · 2026 · 2025 · 2024 · … · Custom range…
```

The year list is generated from `firstPlay`/`lastPlay`, which the page already fetches from
`TOTALS_QUERY` — no hardcoded span, and no year offered that holds no data. "Custom range…" reveals
two `<input type="date">` bound to the same two parameters everything else uses.

### Semantics, which must be written down once

- **Half-open: `ts >= start AND ts < end`.** A closed interval either double-counts a play at
  midnight on a shared boundary or needs a `23:59:59.999` fudge that is wrong for a `TIMESTAMP`
  column. Selecting 2024 means `['2024-01-01', '2025-01-01')`.
- **Bounds are UTC.** `plays.ts` carries the export's `ts` verbatim, which is UTC, and
  `HistoryOverviewView` already pins its date formatting to UTC for exactly this reason. A date
  picker hands back a local date; it must be interpreted as a UTC instant or a play at 01:00 on
  1 January lands in the wrong year for anyone east of Greenwich.
- **Bind ISO strings and cast in SQL** — `ts >= CAST(? AS TIMESTAMP)` — rather than binding a JS
  `Date` and trusting the driver's marshalling. One less thing that can be quietly wrong.
- **A range with no plays renders an empty state in words**, never a table of zeroes.

## Query design

### Parameterisation is the real change

The first draft of this proposal relied on every statement being static, which is what makes
`defineQuery` safe. A time filter ends that: the range comes from the user, and the aggregation has
to happen in SQL — there is no slicing a pre-computed top 25 by date after the fact.

**Use prepared statements, not string building.** Verified present in the installed version:

```ts
prepare<T>(text: string): Promise<AsyncPreparedStatement<T>>
query(...params: any[]): Promise<arrow.Table<T>>   // on AsyncPreparedStatement
```

So `NamedQuery` grows a parameter list, defaulting to none so every existing query is untouched:

```ts
export interface NamedQuery<Row, Params extends readonly unknown[] = []> {
  sql: string
  row: z.ZodType<Row>
  /** Lets the query console run a parameterised statement without knowing its arguments. */
  defaultParams?: Params
}
```

and `HistoryDatabase.query` becomes `query(named, ...params)`, implemented as prepare → query →
close. Note `AsyncPreparedStatement.query` is typed `...params: any[]`, so the driver gives no
safety here at all — the `Params` tuple on `NamedQuery` is the only thing standing between a
reordered argument and a silently wrong answer. Type it tightly.

**The `defaultParams` field exists for `HistoryView`.** The query console iterates `HISTORY_QUERIES`
generically and cannot know what arguments a statement wants; without a default it would have to be
excluded from the console, or the console would need a parameter form. Defaulting to the all-time
bounds keeps it working with a one-line change.

### Every statement always binds a range

**No conditional SQL.** The range predicate is present in all six statements unconditionally, and
"all time" passes sentinel bounds:

```ts
export const ALL_TIME = ['1970-01-01', '3000-01-01'] as const
```

One statement per entity, not two; no `WHERE` assembled from a branch; nothing to test for the
"filter absent" path because there is no such path. Deriving the sentinels from `firstPlay`/
`lastPlay` instead would make "all time" depend on a second query being right, for no gain.

### Six statements from two builders

Three entities × (leaderboard, trend) is six near-identical statements differing only in a join, a
group key and two display expressions. Six hand-maintained copies is six places for the `kind` filter
or the floor to drift, so compose them from one entity descriptor:

```ts
const ENTITY_SQL = {
  artist: {
    join: 'JOIN artists a USING (artist_id)',
    key: 'a.artist_id',
    name: 'a.name',
    subtitle: 'CAST(NULL AS TEXT)',
  },
  song: {/* JOIN tracks … LEFT JOIN artists … */},
  album: {/* JOIN tracks … JOIN albums … LEFT JOIN artists … */},
} as const
```

`leaderboardSql(entity)` and `trendSql(entity)` take one of those and return a string; each result is
still wrapped in its own `defineQuery` with its own schema, and the tests assert on the **generated**
SQL so the composition cannot hide a missing filter. This is the one abstraction the proposal asks
for, and it earns its place: the alternative is copying `kind = 'track' AND ms_played >= …` six times.

### The leaderboard statement

Shown for artists; the other two differ only by the descriptor above.

```sql
SELECT
  a.name                               AS name,
  CAST(NULL AS TEXT)                   AS subtitle,
  count(*)                             AS plays,
  round(sum(ms_played) / 3600000.0, 1) AS hours
FROM plays p JOIN artists a USING (artist_id)
WHERE p.kind = 'track'
  AND p.ms_played >= 30000
  AND p.ts >= CAST(? AS TIMESTAMP)
  AND p.ts <  CAST(? AS TIMESTAMP)
GROUP BY a.artist_id, a.name
ORDER BY count(*) DESC, sum(p.ms_played) DESC, a.name ASC, a.artist_id ASC
LIMIT 25
```

`30000` and `25` are literals above for readability only; in the module they interpolate
`MIN_PLAY_MS` and `MAX_LEADERBOARD_SIZE`, as `TOP_ARTISTS_PER_YEAR_QUERY` already interpolates the
floor and `queries.test.ts` already asserts it does.

Three points that decide whether the numbers are right:

- **Group on the key, never the name.** `docs/streaming-history-context.md` records 22 track URIs in
  the reference export carrying more than one display name. Grouping songs on `t.name` would split
  _Worries_ from _Worries (feat. Koda)_ and understate both. The dimension row already holds the
  most-recently-seen name, so grouping by `track_id` and selecting the name labels the row correctly.
  Same for `album_id` and `artist_id`.
- **Albums need a two-hop join.** `plays` carries a denormalised `artist_id` but **no `album_id`**,
  so albums are only reachable via `tracks`. Take the subtitle from `albums.artist_id`, not
  `plays.artist_id`.
- **The order must be total**, because the size control slices this result rather than re-querying
  (below). The tiebreak chain ends in the primary key so no two rows can tie.

### Size still slices, range still re-queries

**The top 10 is a prefix of the top 25**, so one statement at `LIMIT 25` serves every size and the
size control is a client-side `slice()` with no round-trip. The limit is derived, not written twice:

```ts
export const LEADERBOARD_SIZES = [3, 5, 10, 15, 25] as const
const MAX_LEADERBOARD_SIZE = Math.max(...LEADERBOARD_SIZES)
```

Changing the **range** does re-query, since a different range is a different aggregate. Memoise
results by `` `${entity}:${start}:${end}` `` so going back to a range already seen is free.

### One row shape, three transforms

Each leaderboard schema `.transform()`s to the same object, so one component renders all three:

```ts
const leaderboardRow = z
  .object({
    name: z.string().nullable(),
    subtitle: z.string().nullable(),
    plays: z.number(),
    hours: z.number(),
  })
  .transform((row) => ({ ...row }))
```

`name` and `subtitle` are **nullable, deliberately** — `master_metadata_track_name` and
`master_metadata_album_artist_name` are both nullable in a real export, so an unnamed track URI is
real data, not drift. Rendering it as "Unknown track" is not the coercion `CLAUDE.md` forbids: the
schema still rejects a _missing_ or _renamed_ column, which is the failure the rule exists to catch.
A `z.string()` here would throw on a legitimate export.

`CAST(NULL AS TEXT)` rather than a bare `NULL` in the artists query — DuckDB types an untyped `NULL`
literal as `"NULL"`, and the Arrow column needs to arrive as a nullable varchar for the shared schema
to parse. **Verify this against a real import before building UI on the shape**; together with the
prepared-statement parameter binding it is the most likely thing here to need a second attempt.

## The chart

**Hours per month, as a stacked area, for the leading entries of the current selection.**

### Monthly buckets, on a real time axis

The sketch says "hours per year", but yearly buckets collapse the moment the range narrows — filter
to 2024 and a yearly chart is a single column. Monthly buckets survive every range, give ~108 points
across the reference export's nine years, and on an ECharts `type: 'time'` axis the labels still read
as years when zoomed out. One bucketing rule, no branch on range width.

Per `docs/proposals/charting-library.md`, emit `'%Y-%m-%d'` and not `'%Y-%m'` — a time axis needs a
value it can parse as a date, and an ISO string from SQL sidesteps how Arrow hands back a `TIMESTAMP`.

### Cap the series, and say so

Twenty-five lines is not a chart. The trend renders `min(size, 5)` series and the heading states the
number — "Hours over time — top 5". Silently charting a subset of the table would be the kind of
quiet truncation that reads as completeness.

The cap is applied in SQL with `QUALIFY`, so the trend query selects its own top N on the same range
and the chart cannot disagree with the table:

```sql
WITH leaders AS (
  SELECT a.artist_id
  FROM plays p JOIN artists a USING (artist_id)
  WHERE p.kind = 'track' AND p.ms_played >= 30000
    AND p.ts >= CAST(? AS TIMESTAMP) AND p.ts < CAST(? AS TIMESTAMP)
  GROUP BY a.artist_id, a.name
  QUALIFY row_number() OVER (
    ORDER BY count(*) DESC, sum(p.ms_played) DESC, a.name ASC, a.artist_id ASC) <= 5
)
SELECT
  strftime(date_trunc('month', p.ts), '%Y-%m-%d') AS month,
  a.name                                          AS name,
  round(sum(p.ms_played) / 3600000.0, 2)          AS hours
FROM plays p
  JOIN artists a USING (artist_id)
  JOIN leaders  USING (artist_id)
WHERE p.kind = 'track' AND p.ms_played >= 30000
  AND p.ts >= CAST(? AS TIMESTAMP) AND p.ts < CAST(? AS TIMESTAMP)
GROUP BY 1, 2
ORDER BY 1, 2
```

Four parameters, the range twice. The `ORDER BY` inside `QUALIFY` is the **same chain** as the
leaderboard's, which is what guarantees the charted five are the table's top five.

### Months with no listening are absent, not zero

A month where an artist was not played produces no row. On a time axis that renders as a gap, which
is the honest reading — `charting-library.md` makes the same point. Stacking changes that calculus:
a stacked area needs a value at every x for every series or the bands tear. So either generate the
spine in SQL with `generate_series` and left-join zeroes onto it, **or** render unstacked lines.

**Recommendation: unstacked lines, gaps left as gaps.** Stacking answers "share of listening", which
is not the question this page asks, and it would require manufacturing zeroes that are
indistinguishable from real silence.

### Inline bars are not a chart

The magnitude bar in each row is a `<div>` with `flex: <plays>`, per the scope note in
`charting-library.md`. No library, no axis, no tooltip — `aria-hidden`, with the real figure already
in the adjacent cell for anyone not looking at pixels.

### ECharts

Approved: action `docs/proposals/charting-library.md` — `echarts` and `vue-echarts`, pinned exact.
Its traps apply unchanged and are not restated here. The four that bite on this page:

- **Import through `echarts/core` with explicit `echarts.use([…])` from the first commit.** The
  barrel import is ~360 kB gzipped; the modular path is ~80–130 kB. Retrofitting means auditing every
  import site.
- **Type the option with a narrow `ComposeOption<…>`**, not `EChartsOption`. `vue-tsc` runs on every
  staged file, and a wrong config against the catch-all union produces a several-hundred-line error.
- **jsdom reports every element as 0×0 and has no `ResizeObserver`.** Both need stubbing in
  `src/test-setup.ts` before any test mounts the chart.
- **Keep the rows-to-option transform in its own module**, so the bulk of it is testable as plain
  data and `HISTORY_QUERIES` stays the contract between the database and the view.

## Page structure

### Route

`ROUTE_PATH.historyLeaderboard = '/history/leaderboard'`, `ROUTE_NAME.historyLeaderboard =
'history-leaderboard'`, a `ROUTE_TITLE` entry, and a registration in `router.ts` with no
`requiresSession` — like the other history routes, this reads local data and never calls Spotify.

### The gate is now duplicated three times

`HistoryView` and `HistoryOverviewView` both open with the same sequence: check `hasStoredHistory()`,
redirect to `ROUTE_PATH.history` with `NOTICE.noHistory` if absent, otherwise `sharedHistoryDatabase`
with a progress handler writing into a `message` ref, wrapped in a loading/ready/error `STATUS` union.
The leaderboard would be the third copy.

Per the shared-concern rule in `CLAUDE.md`, extract it once — a `useHistoryDatabase()` composable in
`src/history/` returning `{ status, message, database }` and performing the redirect. Both existing
views move onto it in the same change. This is load-bearing: a fix to the gate currently has to land
in two files and would shortly need three.

### Controls

None of the three has an existing component.

- **Entity** — a segmented control built as a native radio group (`role="radiogroup"`,
  visually-hidden `<input type="radio">`, styled `<label>`), so arrow keys work and the selected
  state is announced. `AppButton` has no pressed variant and giving it one is a wider change.
- **Size** and **range** — labelled native `<select>`s. Nothing about either benefits from being
  bespoke, and the range select owns the custom-range disclosure.

Each as a `const` object, in the pattern `STATUS`, `PLAY_KIND` and `BUTTON_VARIANT` already use:

```ts
export const LEADERBOARD_ENTITY = { artist: 'artist', song: 'song', album: 'album' } as const
type LeaderboardEntity = (typeof LEADERBOARD_ENTITY)[keyof typeof LEADERBOARD_ENTITY]
```

### Loading

On mount: `TOTALS_QUERY` for the year list, then the leaderboard and trend for the default selection.
Changing entity or range fetches that pair if it is not already memoised; changing size is
synchronous. Reuse `SkeletonBlock` for the first paint, and keep the previous rows visible while a
range change is in flight rather than flashing a skeleton on every interaction.

## Caveats that must reach the UI

`CLAUDE.md` requires the album-artist caveat wherever artist totals are shown, and this page shows
little else. Four more belong beside it. The `Tooltip` + `?` pattern from `StatTile` carries them
without turning the page into footnotes.

| Caveat                  | Wording                                                                                                                                                    | Shown on         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Album artist            | Already written as `ALBUM_ARTIST_CAVEAT` in `HistoryOverviewView.vue`                                                                                      | artists, albums  |
| Singles count as albums | "Spotify files singles and EPs as albums, so a one-track release can outrank a full record."                                                               | albums           |
| Latest album wins       | "A song that appears on a reissue or compilation credits all of its plays to the most recent album it was seen on."                                        | albums           |
| The floor               | "Plays shorter than 30 seconds are skips, and are not counted." — derive the number from `MIN_PLAY_MS`, as the overview already derives `MIN_PLAY_SECONDS` | all three        |
| Partial years           | The first and last years of the export are partial. Say so next to a year selection, or 2018 looks like a quiet year rather than a nine-month one.         | the range select |

**`ALBUM_ARTIST_CAVEAT` must move** out of `HistoryOverviewView.vue` into a shared module as part of
this work. Two views holding their own copy of the same user-facing string is exactly the drift the
no-repeated-literals rule names.

"Latest album wins" is a genuine property of the importer, not a hypothetical: `#updateTrack` in
`tables.ts` overwrites a track's `album_id` whenever it sees that URI with a later timestamp. A track
played 200 times from the original album and once from a deluxe reissue contributes all 201 plays to
the deluxe edition, and a re-import next year can reshuffle the album board with no change in
listening. Worth watching in real data — if it distorts the top 25 badly the fix is a first-seen
rather than last-seen album key, which is an importer change and a schema version bump, not a query
change.

## Deliberately out of scope

- **Podcasts and audiobooks.** `kind = 'track'` throughout, per the explicit-filter rule. A show
  leaderboard over `shows`/`episodes` is a separate, easy follow-up.
- **Artist images and album art.** Needs the enrichment layer; see
  `docs/proposals/artist-metadata-enrichment.md`. Rows are text until that exists.
- **Brushing the chart to set the range.** ECharts `dataZoom` could drive the same two parameters the
  select writes, which would be a lovely interaction. It is also a second input path into shared
  state; worth adding once the select-driven path is proven.
- **Controls in the URL.** `?top=artist&n=10&from=…&to=…` would survive a refresh and make the back
  button meaningful. Cheap, and more tempting now there are three controls, but still state
  management for state nobody has asked to keep.
- **Clicking a row.** No drill-down. There is nowhere to drill to yet.

## Testing

- `queries.test.ts` gains, for each of the six **generated** statements: the explicit `kind = 'track'`
  filter, the named floor rather than an inline number, both range placeholders, a single statement,
  and the derived `LIMIT`. Asserting on the builder output is what makes the shared fragment safe.
- A test that the trend query's `QUALIFY` ordering is character-for-character the leaderboard's
  `ORDER BY` chain. If those drift, the chart silently plots different entities than the table.
- A test that each statement groups by its key column (`artist_id`, `track_id`, `album_id`) and not
  by a name column. This is the regression that would corrupt every ranking without failing anything.
- Row-schema tests in the shape the file already uses — a representative row parses, a renamed column
  throws, a count arriving as `null` or `bigint` throws, a null `name` parses rather than throwing.
- Range semantics as pure functions, tested without a database: a year preset maps to
  `['2024-01-01', '2025-01-01')`, a local date input maps to a UTC instant, `start > end` is
  rejected, and "all time" maps to the sentinels.
- View tests per the no-branching rule: mount with a stubbed database returning fixed rows, then one
  deterministic test each for the default render, changing entity, changing size, and changing range.
- Chart transform tested as plain data — rows in, option out — plus one ECharts SSR-SVG render
  (`renderToSVGString()`), which needs neither jsdom nor `node-canvas`.
- The composable extraction is proven by the two existing view tests passing unchanged.

## If this gets built

1. Extract `useHistoryDatabase()` and move `ALBUM_ARTIST_CAVEAT` to a shared module, with both
   existing views migrated and green. Separate commit; it touches files the feature does not.
2. Extend `NamedQuery`/`defineQuery` with the parameter tuple and `defaultParams`, and switch
   `HistoryDatabase.query` to prepared statements. Verify parameter binding and `CAST(NULL AS TEXT)`
   against a real import **here**, before anything depends on the shapes.
3. Add the two SQL builders, the six queries, their schemas and tests.
4. Add `echarts` and `vue-echarts` pinned exact, run `pnpm install`, and add the jsdom stubs to
   `src/test-setup.ts`.
5. Add the route, the view, the three controls, the inline bars, the chart and the caveat tooltips.
6. Add the second "Explore it" card, and reword the overview's `explore__lede` — "More ways to read
   this are on the way. For now:" stops being true.
7. `pnpm lint` and `pnpm test`.

## Review checklist delta

Every box in `docs/streaming-history-context.md` still applies. The six that do real work here:

- [ ] Songs grouped by `track_id`, albums by `album_id`, artists by `artist_id` — never by name
- [ ] `kind = 'track'` and `MIN_PLAY_MS` present in all six generated statements
- [ ] Range bound as a prepared-statement parameter — **no SQL assembled from user input**
- [ ] Range is half-open and interpreted as UTC, matching how the overview already formats dates
- [ ] Each query defined with `defineQuery` and a Zod schema; no field defaulted to `0` or `''`
- [ ] Album-artist caveat surfaced on both the artist and album leaderboards, from one shared string

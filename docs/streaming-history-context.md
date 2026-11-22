# Extended Streaming History Context

What is **not** derivable from the code in `src/history/`: facts about Spotify's export that cost
effort to establish, decisions already made and lived with, and rules for the parts not yet built.

Read this before writing any code that parses, stores or queries the export.

**Scope boundary**: this is about data the user already has on disk. It is _not_ about
`api.spotify.com` — for anything touching the Web API read `docs/spotify-api-context.md` instead.
The two meet only at enrichment (see [Enrichment](#enrichment-joins-by-name-not-id)).

## Source of Truth

**The vendored PDF is documentation, not schema. Derive types from a real export file.**

- `data/Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.md` is the English
  section of Spotify's own README, extracted for convenience. It is **prose, and it is stale**
- **NEVER** write a parser from the PDF's field list. Its example object disagrees with reality
  (see below). Shape the types from an actual `Streaming_History_Audio_*.json`
- `data/` is gitignored and must stay that way. It holds IP addresses and a complete timestamped
  behavioural record of a real person

### The PDF's schema is wrong in three ways

Verified **22 November 2026** against a real 2018–2026 export:

| PDF says            | Reality                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `ip_addr_decrypted` | field is `ip_addr`                                                                                        |
| `username`          | **absent entirely**                                                                                       |
| —                   | four extra fields: `audiobook_title`, `audiobook_uri`, `audiobook_chapter_uri`, `audiobook_chapter_title` |

The live shape lives in `StreamingHistoryEntry` (`src/history/export/tables.ts`), derived from a real
file rather than from the PDF. A field may also be **absent rather than null** in a hand-edited or
third-party file, which is why `classifyPlay` tests for a non-empty string rather than `!== null`.

## Measured Shape of One Real Export

From a single export (2018-03-05 → 2026-11-14), measured 22 November 2026. **n=1** — an
order-of-magnitude guide, not a contract. Kept because it calibrates what "large" means here.

|                          |                       |
| ------------------------ | --------------------- |
| files / size             | 24 JSON files, 172 MB |
| rows                     | 222,902               |
| → track plays            | 220,544               |
| → podcast episode plays  | 2,347                 |
| → audiobook plays        | 11                    |
| unique track URIs        | 32,017                |
| unique artist names      | 9,179                 |
| podcast shows / episodes | 75 / 763              |
| total playtime           | 9,430 h               |

**The export is mostly repeated strings** — 6.9 plays per unique track. Dictionary-encoding the
string columns into integer keys is what turns 172 MB of JSON into a few MB of tables. This is the
single most important property of the dataset.

## CRITICAL: Track Identity Is the URI

**NEVER key tracks, artists or albums by display name.** Spotify relabels catalogue entries, so the
same `spotify_track_uri` appears under different names across years:

```
'Worries'                                        ⟷  'Worries (feat. Koda)'
'Sweet Dreams (Are Made of This) - 2005 Remaster' ⟷  '… - Remastered'
```

In the reference export **22 track URIs have multiple names** and **12 have multiple artist names**.
Name-keyed dedupe silently splits a track's history across two rows and quietly corrupts every
top-N. Dedupe on the URI and keep the most recent name for display; same for episodes.

## CRITICAL: Enrichment Joins by Name, Not ID

**The export contains no artist URI and no album URI.** The only artist signal anywhere in the file
is `master_metadata_album_artist_name` — a bare string. Not yet built; these constraints shape it:

- Resolving an artist to Spotify (for images, genres) or Last.fm (for tags) needs a **name → ID
  search step**, which is fuzzy and fallible. Cache every resolution
- **Resolve lazily.** 9,179 artists is far too many to look up eagerly; only resolve artists that
  actually surface in a top-N the user is looking at
- It is the **album** artist, not the track artist. Featured artists are invisible — plays of
  _Worries (feat. Koda)_ are credited wholly to the primary artist. **Say this in the UI** wherever
  artist totals appear, as the overview's artist tile does
- **Spotify exports are full cumulative snapshots, not deltas.** Re-importing rebuilds every table,
  so **❌ FORBIDDEN**: storing fetched enrichment on the `artists` row. It belongs in
  `artist_enrichment`, keyed by artist name — a natural key that survives a rebuild

## Storage: DuckDB-WASM, Snapshotted to IndexedDB

**Decision: SQL is the query layer, not a hand-rolled loop kernel.** The stats this app produces are
top-N-per-group, windowed and time-bucketed — the shape SQL expresses well and imperative
accumulators express badly, and a schema plus SQL is legible to any contributor. It also makes the
deferred ["ask AI"](#appendix-ai-query-layer-deferred) feature nearly free. The cost is a 4.4 MB
brotli wasm payload, cached after first load. **SQLite-WASM is the documented fallback** if that
ever becomes the binding constraint.

**Settled, and not as planned: DuckDB-WASM cannot create an OPFS-backed database.** It only adopts
an OPFS handle whose file is already non-empty, so a database it creates itself never persists.
Cross-session persistence comes from a per-table Parquet snapshot in IndexedDB instead — roughly
3.8 MiB for the 172 MB export, restoring in well under a second against ~15 s to re-parse the JSON.
See the comment on `OPFS_DB_PATH` in `src/history/duckdb/client.ts` for the exact failure mode.

## Schema

`src/history/duckdb/schema.ts` is authoritative; it is not repeated here. The reasoning behind it:

- **Star schema** — narrow fact table, dictionary dimensions. See the dataset property above
- **`plays.artist_id` is deliberately denormalised** from `tracks`. Nearly every statistic groups by
  artist; carrying the key on the fact row removes a join from the hot path for ~880 KB. It is
  derived at import, never independently edited
- **`artist_enrichment` is deliberately outside the rebuild set** — see Enrichment above
- **`meta` carries the counts the build produced** (malformed rows, renamed and reattributed
  tracks) so they survive a snapshot restore and can be surfaced rather than discarded
- **Version the schema** (`meta.schema_version`). A snapshot written by an older version is
  discarded and rebuilt rather than queried under newer assumptions. Any column change means
  bumping it, which forces every existing user to re-import

## Import Pipeline

`src/history/index.ts` orchestrates; `export/` reads, `duckdb/` loads, `snapshot/` persists.

1. **Accept** a zip, a folder, or loose `.json` files — `export/selection.ts`, validated before any
   expensive work so a wrong folder fails in milliseconds with a message naming the expected format
2. **Enumerate** files matching `Streaming_History_*.json` at any depth. The container's own name
   proves nothing; people rename it and zip tools rename it again
3. **Parse and build, one file at a time**, interning names into dimension maps
4. **Insert** dimensions, then facts, then the `meta` row
5. **Snapshot** every table to Parquet in IndexedDB

**⚠️ The one real memory trap is step 3.** Holding all 24 parsed files at once peaks in the hundreds
of MB. **ALWAYS** release each file's parsed array before reading the next. Note the zip path trades
against this: it decompresses all matched entries up front, so a picked folder is the cheaper route
for a very large export.

**⚠️ Known gap: the pipeline runs on the main thread.** It was specified for a Web Worker and is not
there yet, so a large import blocks paint — including the progress bar meant to reassure during it.
Moving it is the one piece of unfinished business in this area.

Other import rules:

- **Report progress per file.** Import is seconds, not milliseconds — the UI must not look frozen
- **Re-import replaces**, it does not merge. Drop and rebuild everything except `artist_enrichment`
- Rows naming no track, episode or audiobook are malformed. **Count them and surface the count**;
  never drop them silently

## Query Layer

- **All stats are SQL**, named in `src/history/duckdb/queries.ts`. Nothing inline at call sites
- **Every query is typed.** `defineQuery` pairs each statement with a Zod row schema;
  `database.query(NAMED_QUERY)` returns `z.infer` of that schema. `runQuery` returns
  `Record<string, unknown>` and exists only for the debug console and the deferred AI layer, where
  the shape genuinely is not known until runtime
  - DuckDB's JS mapping is where a hand-written type lies: `count(*)` → BIGINT, `round()` → DOUBLE,
    `date_part()` → BIGINT, `strftime()` → VARCHAR. `toRows` normalises bigint to number; declare
    the result strictly so a change fails loudly instead of coercing
  - **❌ FORBIDDEN**: coercing a missing or wrong-typed column to `0`/`''`. A renamed column that
    renders as "0 plays" is indistinguishable from a real answer
  - **`coalesce` NULL-able aggregates in SQL**, deliberately. `sum()` and `min()` are NULL over zero
    rows, and a legitimately empty or podcast-only export would otherwise fail validation
  - **No `;` inside a query, including in comments.** `splitStatements` splits naively on it
- **Filter `kind = 'track'` explicitly** in music stats. 2,358 of 222,902 reference rows are
  podcast/audiobook. Including them in "top artists" is a bug; excluding them from "total playtime"
  may also be a bug. Decide per statistic, deliberately
- `ms_played` is **time played, not track length**. A 3-second skip is a row. `MIN_PLAY_MS` (30 s,
  Spotify's own royalty threshold) is the floor; apply it consistently and say so in the UI
- Prefer `QUALIFY` + window functions for top-N-per-group

## Privacy

- **The import never leaves the device.** No upload, no telemetry carrying export contents, ever
- `ip_addr` is in every row and is **deliberately never copied into a table**. If a feature ever
  needs it, add the column deliberately
- **❌ FORBIDDEN**: sending any part of the export to a third-party API. Enrichment sends _artist
  names only_, and only for artists the user is actively viewing

## Appendix: AI Query Layer (deferred)

Not in scope. Recorded so nothing built now forecloses it. **The schema is the only thing this
feature needs.**

The one design constraint worth honouring early: **generated code must be SQL, never JavaScript.**
`eval()`-ing model-written JS against this dataset would give that code `fetch`, DOM and IndexedDB
access over someone's IP addresses and 8 years of behaviour. A SQL string handed to a wasm engine
with no network cannot exfiltrate anything. If this feature is ever built, it is built on SQL.

Validation rules for whenever it is picked up:

- Single statement only — reject anything following a `;`
- Must begin with `SELECT` or `WITH`
- Reject `ATTACH`, `COPY`, `INSTALL`, `LOAD`, `EXPORT`, and the `read_parquet` / `read_csv` /
  `read_json` family
- **Do not install `httpfs`** — without it DuckDB-WASM has no network primitive at all
- Read-only connection, in a worker, with a row cap and a kill timeout
- Show the user the generated SQL alongside the result

## Review Checklist

Before merging anything in this area:

- [ ] Types derived from a real export file, not from the PDF; absent fields treated as absent
- [ ] Tracks and episodes keyed by URI; most-recent name used for display
- [ ] `kind` filtered explicitly in every statistic, and the choice is deliberate
- [ ] Every new query defined with `defineQuery` and a Zod row schema; no `Record<string, unknown>`
      reaching app code, and no field coerced to a default to paper over a shape change
- [ ] Each parsed file released before the next is read
- [ ] `meta.schema_version` bumped if any column changed, and checked on load
- [ ] Re-import preserves `artist_enrichment`
- [ ] No export data leaves the device; `ip_addr` not persisted without a stated reason
- [ ] Album-artist caveat surfaced in UI wherever artist totals are shown
- [ ] `pnpm lint` and `pnpm test` pass

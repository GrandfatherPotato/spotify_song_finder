# Extended Streaming History Context

Implementation guideline for the **import and analysis** feature: a user drops in their Spotify
"Extended Streaming History" zip and gets a lifetime Wrapped — total playtime, top artists per year,
listening clocks, fun facts.

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

Actual key order, from a 2025 file:

```
ts, platform, ms_played, conn_country, ip_addr,
master_metadata_track_name, master_metadata_album_artist_name,
master_metadata_album_album_name, spotify_track_uri,
episode_name, episode_show_name, spotify_episode_uri,
audiobook_title, audiobook_uri, audiobook_chapter_uri, audiobook_chapter_title,
reason_start, reason_end, shuffle, skipped, offline, offline_timestamp, incognito_mode
```

## Measured Shape of One Real Export

Numbers below are from a single export (2018-03-05 → 2026-11-14), measured 22 November 2026. **n=1** —
treat them as an order-of-magnitude guide, not a contract. A light user's export will be far smaller;
assume nothing breaks at 5× this.

|                          |                       |
| ------------------------ | --------------------- |
| files / size             | 24 JSON files, 172 MB |
| rows                     | 222,902               |
| → track plays            | 220,544               |
| → podcast episode plays  | 2,347                 |
| → audiobook plays        | 11                    |
| unique track URIs        | 32,017                |
| unique artist names      | 9,179                 |
| unique album names       | 19,481                |
| podcast shows / episodes | 75 / 763              |
| total playtime           | 9,430 h               |

**The export is mostly repeated strings** — 6.9 plays per unique track. Dictionary-encoding the
string columns into integer keys is what turns 172 MB of JSON into a few MB of tables. This is the
single most important property of the dataset.

Parse cost, Node 24 / V8 (browser will be the same order, verify in a worker):
`JSON.parse` of all 24 files **387 ms**; building dimension + fact tables from it **98 ms**.

## CRITICAL: Track Identity Is the URI

**NEVER key tracks, artists or albums by display name.** Spotify relabels catalogue entries, so the
same `spotify_track_uri` appears under different names across years:

```
'Worries'                                        ⟷  'Worries (feat. Koda)'
'Sweet Dreams (Are Made of This) - 2005 Remaster' ⟷  '… - Remastered'
'CITY OF ANGELS (feat. YUNGBLUD) - YUNGBLUD Remix' ⟷ 'CITY OF ANGELS - YUNGBLUD Remix'
```

In the reference export **22 track URIs have multiple names** and **12 have multiple artist names**.
Name-keyed dedupe silently splits a track's history across two rows and quietly corrupts every
top-N.

- Dedupe on `spotify_track_uri`; keep the **most recent** name seen for display
- Same for episodes: key on `spotify_episode_uri`

## CRITICAL: Enrichment Joins by Name, Not ID

**The export contains no artist URI and no album URI.** The only artist signal anywhere in the file
is `master_metadata_album_artist_name` — a bare string.

Consequences, all of which shape the design:

- Resolving an artist to Spotify (for images, genres) or Last.fm (for tags) needs a **name → ID
  search step**, which is fuzzy and fallible. Cache every resolution
- **Resolve lazily.** 9,179 artists is far too many to look up eagerly; only resolve artists that
  actually surface in a top-N the user is looking at
- It is the **album** artist, not the track artist. Featured artists are invisible — plays of
  _Worries (feat. Koda)_ are credited wholly to the primary artist. **Say this in the UI**, or the
  numbers will look wrong to anyone who knows their own listening

## Storage: DuckDB-WASM

**Decision: DuckDB-WASM, persisted to OPFS.** SQL is the query layer, not a hand-rolled loop kernel.

Rationale: the stats this app produces are top-N-per-group, windowed and time-bucketed — the exact
shape SQL expresses well and imperative accumulators express badly. A schema plus SQL is also
legible to any contributor, where a bespoke typed-array kernel is legible only to its author. The
late-stage ["ask AI"](#appendix-ai-query-layer-deferred) feature then costs almost nothing extra.

Wire cost, measured 22 November 2026:

| artefact         | raw     | gzip   | brotli     |
| ---------------- | ------- | ------ | ---------- |
| `duckdb-eh.wasm` | 34.0 MB | 6.7 MB | **4.4 MB** |
| `sqlite3.wasm`   | 0.8 MB  | 0.4 MB | 0.3 MB     |

4.4 MB brotli, cached after first load, in an app that already accepts a 172 MB zip. **SQLite-WASM is
the documented fallback** if that ever becomes the binding constraint — at 220k rows it would also be
fast, just clumsier for top-N-per-group.

**⚠️ Unverified**: DuckDB-WASM + OPFS persistence has not been prototyped in this repo yet. Confirm
round-trip persistence and measure on-disk size before building UI on top of it.

## Schema

Star schema: narrow fact table, dictionary dimensions, one denormalised key for speed.

```sql
CREATE TYPE play_kind AS ENUM ('track', 'episode', 'audiobook');

CREATE TABLE artists  (artist_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE albums   (album_id  INTEGER PRIMARY KEY, name TEXT, artist_id INTEGER);
CREATE TABLE tracks   (track_id  INTEGER PRIMARY KEY, uri TEXT UNIQUE,
                       name TEXT, artist_id INTEGER, album_id INTEGER);
CREATE TABLE shows    (show_id    INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE episodes (episode_id INTEGER PRIMARY KEY, uri TEXT UNIQUE,
                       name TEXT, show_id INTEGER);

CREATE TABLE plays (
  ts           TIMESTAMP NOT NULL,
  ms_played    INTEGER   NOT NULL,
  kind         play_kind NOT NULL,
  track_id     INTEGER,            -- null unless kind = 'track'
  episode_id   INTEGER,            -- null unless kind = 'episode'
  artist_id    INTEGER,            -- denormalised from tracks; null for podcasts
  shuffle      BOOLEAN, skipped BOOLEAN, offline BOOLEAN, incognito BOOLEAN,
  reason_start TEXT, reason_end TEXT, conn_country TEXT, platform TEXT
);
```

**`plays.artist_id` is deliberately denormalised** from `tracks`. Nearly every statistic groups by
artist; carrying the key on the fact row removes a join from the hot path for ~880 KB. Keep it in
sync at import — it is derived, never independently edited.

### Enrichment lives in its own table

```sql
CREATE TABLE artist_enrichment (
  artist_name TEXT PRIMARY KEY,     -- natural key; see "Enrichment Joins by Name"
  spotify_id TEXT, image_url TEXT, genres TEXT[], lastfm_tags TEXT[],
  fetched_at TIMESTAMP
);
```

**Spotify exports are full cumulative snapshots, not deltas.** Re-importing next year rebuilds
`plays` and every dimension from scratch. **❌ FORBIDDEN**: storing fetched enrichment on the
`artists` row — a re-import would destroy it. Keep it in a separate table keyed by a natural key that
survives rebuilds.

## Import Pipeline

Runs entirely in a **Web Worker**. Nothing here touches the main thread.

1. **Unzip** — `fflate`. Accept the zip, or a folder, or loose `.json` files
2. **Enumerate** — match `Streaming_History_*.json`. Ignore the PDF and any other payload
3. **Parse and build, one file at a time.** Intern names into dimension maps, append fact rows,
   then **discard the parsed JSON before opening the next file**
4. **Insert** dimensions, then facts
5. **Persist** to OPFS; write a `meta` row with schema version, import timestamp and source filenames

**⚠️ The one real memory trap is step 3.** Holding all 24 parsed files at once peaks in the hundreds
of MB. Streaming file-by-file keeps the peak near 20 MB. **ALWAYS** release each file's parsed array
before reading the next.

Other import rules:

- **Report progress per file.** Import is seconds, not milliseconds — the UI must not look frozen
- **Version the schema from day one** (`meta.schema_version`). Columns will be added; an old
  persisted database must be detected and rebuilt rather than queried with a newer assumption
- **Re-import replaces**, it does not merge. Drop and rebuild everything except `artist_enrichment`
- Rows with no `spotify_track_uri`, no `spotify_episode_uri` and no `audiobook_uri` are malformed —
  count them, surface the count, do not silently drop

## Query Layer

- **All stats are SQL.** Keep them as named queries in one module, not scattered string literals
- **Filter `kind = 'track'` explicitly** in music stats. 2,358 of 222,902 reference rows are
  podcast/audiobook. Including them in "top artists" is a bug; excluding them from "total playtime"
  may also be a bug. Decide per statistic, deliberately
- `ms_played` is **time played, not track length**. A 3-second skip is a row. Most "top" statistics
  want a minimum-duration floor — pick one, name it, apply it consistently
- Prefer `QUALIFY` + window functions for top-N-per-group

Reference query — top 3 artists for every year:

```sql
SELECT date_part('year', ts) AS year, a.name, sum(ms_played) / 3600000.0 AS hours
FROM plays p JOIN artists a USING (artist_id)
WHERE kind = 'track'
GROUP BY 1, 2
QUALIFY row_number() OVER (PARTITION BY year ORDER BY sum(ms_played) DESC) <= 3
ORDER BY year, hours DESC;
```

## Privacy

- **The import never leaves the device.** No upload, no telemetry carrying export contents, ever
- `ip_addr` is in every row. It is not needed for any planned statistic — **prefer dropping it at
  parse time** rather than storing it. If a feature ever needs it, add the column deliberately
- **❌ FORBIDDEN**: sending any part of the export to a third-party API. Enrichment sends _artist
  names only_, and only for artists the user is actively viewing

## Build Order

Deliberately phased. **The AI feature is last and is a bonus, not a foundation** — nothing in phases
1–4 may depend on it.

1. **Import + schema** — unzip, parse, build tables, persist to OPFS, re-import path, progress UI
2. **Core stats** — total playtime, top artists/tracks/albums, per-year breakdowns, listening clock
3. **Enrichment** — lazy artist resolution, images, Last.fm tags, with cache
4. **Presentation** — the Wrapped-style graphs and fun facts
5. **Ask AI** — deferred, see below

## Appendix: AI Query Layer (deferred)

Not in scope until phase 5. Recorded here so phases 1–4 do not foreclose it. **The schema above is
the only thing this feature needs** — if the schema stays clean and documented, this stays cheap.

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

- [ ] Types derived from a real export file, not from the PDF
- [ ] Tracks and episodes keyed by URI; most-recent name used for display
- [ ] `kind` filtered explicitly in every statistic, and the choice is deliberate
- [ ] Import runs in a worker and releases each parsed file before the next
- [ ] `meta.schema_version` written and checked on load
- [ ] Re-import preserves `artist_enrichment`
- [ ] No export data leaves the device; `ip_addr` not persisted without a stated reason
- [ ] Album-artist caveat surfaced in UI wherever artist totals are shown
- [ ] `pnpm lint` and `pnpm test` pass

# Proposal: Charting Library for History Views

**Status: proposal. Not actioned, no code written.** Captured for future reference.

Package versions, licences and download counts were read from the npm registry API on **22 November
2026**. Re-check before installing; the field moves.

## Problem

The Extended Streaming History import lands in DuckDB-WASM and `HISTORY_QUERIES`
(`src/history/duckdb/queries.ts`) turns it into tabular results. The views need to render those as
charts — principally **plays over time for one or several tracks**, plus top-N bars and, later,
calendar heatmaps and share-of-listening breakdowns.

No charting dependency exists in the project today. The requirement is a library that is reliable
and widely deployed, so the choice does not become a migration later.

## Verdict

**Apache ECharts 6, via the `vue-echarts` component.**

| Need                                     | ECharts answer                       | Cost elsewhere                             |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------ |
| Real time axis                           | `xAxis: { type: 'time' }`, built in  | Chart.js needs a date adapter + date lib   |
| Zoom / range brush over multi-year data  | `dataZoom` slider + inside, built in | Chart.js needs `chartjs-plugin-zoom`       |
| Many series from one query result        | `dataset` + `transform` + `encode`   | Chart.js: reshape into `datasets[]` in JS  |
| Calendar heatmap, treemap, sankey, stack | in core                              | Chart.js needs `chartjs-chart-matrix` etc. |
| Cross-series tooltip                     | `tooltip: { trigger: 'axis' }`       | Chart.js `interaction.mode: 'index'` — par |
| Dense-series downsampling                | `sampling: 'lttb'`, `progressive`    | Chart.js decimation plugin — par           |
| Testable without native deps             | SSR SVG mode, `renderToSVGString()`  | Chart.js is canvas-only                    |

Net: ECharts reaches the target set with **one** dependency (two counting the Vue wrapper) where
Chart.js needs four. Governance is the second reason — ECharts is an Apache Software Foundation
top-level project rather than a single-maintainer repo, with Alibaba, Baidu, Tencent, GitLab and
Intel named as adopters at graduation, and it is the engine inside Apache Superset and Grafana's
Business Charts panel.

## The field, as measured

| Package                    | Latest | Published  | Licence         | Weekly downloads |
| -------------------------- | ------ | ---------- | --------------- | ---------------: |
| `echarts`                  | 6.1.0  | 2026-05-19 | Apache-2.0      |       11,324,468 |
| `vue-echarts`              | 8.3.2  | 2026-10-09 | MIT             |          786,377 |
| `chart.js`                 | 4.6.1  | 2026-10-22 | MIT             |       17,936,076 |
| `vue-chartjs`              | 5.3.7  | 2026-11-20 | MIT             |        1,416,385 |
| `chartjs-adapter-date-fns` | 3.0.0  | 2022-12-11 | MIT             |        1,270,371 |
| `chartjs-plugin-zoom`      | 3.0.0  | 2026-11-21 | MIT             |          879,934 |
| `@observablehq/plot`       | 0.6.19 | 2026-11-05 | ISC             |        1,424,045 |
| `apexcharts`               | 8.9.1  | 2026-11-18 | custom, non-OSI |        2,920,288 |
| `@unovis/vue`              | 1.8.1  | 2026-11-10 | Apache-2.0      |          325,569 |
| `highcharts`               | —      | —          | commercial      |        3,775,134 |

`vue-echarts` 8 declares peers `vue: ^3.3.0` and `echarts: ^6.0.0`, and ships **zero runtime
dependencies**. Both match the installed Vue 3.5.45.

## Why a wrapper at all

ECharts is framework-agnostic — `init(el)`, `setOption(option)`, `dispose()`. A hand-written
composable doing that is roughly fifty lines, and would be a defensible alternative under the
change-footprint rule in `CLAUDE.md`.

What `vue-echarts` adds: `autoresize` (throttled ResizeObserver), disposal on unmount, ~60 typed
events including ZRender `zr:`-prefixed ones, `provide`/`inject` keys so one theme applies to every
chart below it, proxied instance methods on the template ref, and a `manual-update` escape hatch
that stops reactive observation for high-frequency updates. The parts worth paying for are resize
and disposal — forgetting either leaks or leaves stale charts.

Within the ECharts ecosystem there is no competitive wrapper field. The alternatives are abandoned:
`echarts-for-vue` last published 2021, `vue-echarts-v3` 2019, `v-charts` 2018, each under 5,000
downloads a week.

Note that the SSR-SVG testing route below uses ECharts directly and is available either way — it is
not a property of the wrapper.

## Feeding it from DuckDB

`toRows()` in `src/history/duckdb/client.ts` already normalises Arrow rows into plain objects and
converts `bigint` to `number`, which is exactly the shape `dataset.source` wants. No adapter layer
is needed between the query result and the chart.

A plays-over-time query would look like:

```sql
SELECT
  strftime(date_trunc('month', ts), '%Y-%m-%d') AS month,
  t.name                                        AS track,
  count(*)                                      AS plays,
  round(sum(ms_played) / 3600000.0, 2)          AS hours
FROM plays p JOIN tracks t USING (track_id)
WHERE kind = 'track' AND ms_played >= 30000 AND t.track_id IN (…)
GROUP BY 1, 2
ORDER BY 1
```

`'%Y-%m-%d'`, not `'%Y-%m'` — a `type: 'time'` axis needs a value it can parse as a date. Emitting an
ISO string from SQL also sidesteps any question of how Arrow hands back a `TIMESTAMP`.

One series per track, derived declaratively rather than by grouping in JS:

```ts
dataset: [
  { source: rows },
  ...tracks.map((name) => ({
    transform: { type: 'filter', config: { dimension: 'track', '=': name } },
  })),
],
series: tracks.map((name, i) => ({
  type: 'line',
  name,
  datasetIndex: i + 1,
  encode: { x: 'month', y: 'plays' },
  showSymbol: false,
  connectNulls: false,
})),
```

## Calendar heatmap

The GitHub-contributions-style view — one cell per day, shaded by how much was listened to — is a
first-class coordinate system in ECharts core, not a plugin. It needs `CalendarComponent`,
`VisualMapComponent` and `HeatmapChart` registered via `echarts.use([…])`.

The query is a straightforward daily rollup:

```sql
SELECT
  strftime(ts, '%Y-%m-%d')             AS day,
  count(*)                             AS plays,
  round(sum(ms_played) / 3600000.0, 2) AS hours
FROM plays
WHERE kind = 'track' AND ms_played >= 30000
GROUP BY 1
ORDER BY 1
```

A multi-year history becomes **one calendar per year**, stacked, with each heatmap series bound to
its calendar by `calendarIndex`:

```ts
calendar: years.map((year, i) => ({
  range: String(year),
  cellSize: ['auto', 14],
  top: 100 + i * 160,
  left: 70,
  right: 30,
})),
series: years.map((year, i) => ({
  type: 'heatmap',
  coordinateSystem: 'calendar',
  calendarIndex: i,
  data: daysIn(year),
})),
visualMap: { min: 0, max: busiestDay, calculable: true, orient: 'horizontal', left: 'center' },
```

`range` accepts a year (`'2024'`), a month (`'2024-02'`) or an explicit span
(`['2024-01-02', '2024-02-23']`).

Four things to get right:

- **A heatmap on a calendar takes `[date, value]` tuples**, not a `dataset` with `encode`. The
  declarative dataset pattern used for the line charts does not carry over, so the transform module
  needs a second output shape — rows in, `[string, number][]` out, grouped by year.
- **One shared `visualMap` across every series**, so a busy day in 2019 is the same colour as a busy
  day in 2024. A per-year scale makes quiet years look as active as loud ones, which is the single
  easiest way to make this chart lie.
- **Days with no listening are absent from the query result.** Omitted cells render as empty rather
  than as the bottom of the scale, which is the honest reading — a gap in the data is not a zero.
  Emit explicit zeroes from SQL only if a deliberate decision is made to show them that way.
- **Allow roughly 150–160 px of vertical space per year** via `top`, or the rows overlap. Ten years
  of history is a tall chart; it may want its own scrolling view rather than a card.

## Traps

- **`import * as echarts from 'echarts'` ships the full bundle** — about 360 kB gzipped. The modular
  path (`echarts/core` plus explicit `echarts.use([…])`) brings a line/bar build to roughly 80–130 kB
  gzipped. Nearly every "ECharts is heavy" complaint traces to this one line. Measure the real figure
  with `rollup-plugin-visualizer` before locking it in.
- **`EChartsOption` is an enormous union.** A wrong config produces a type error hundreds of lines
  long. Type each chart's option with a narrow `ComposeOption<LineSeriesOption | GridComponentOption
| …>` instead of the catch-all. This matters more here than in most projects because `vue-tsc` runs
  on every staged file via lint-staged.
- **jsdom reports every element as 0×0**, so a mounted chart renders empty, and `ResizeObserver` is
  absent. Component tests that mount `<VChart>` need both stubbed in a shared setup file.
- **Months with no plays simply will not appear as rows.** On a time axis that renders as a gap,
  which is usually right. If a zero is wanted instead, generate the spine in SQL with
  `generate_series` and left-join onto it. Decide deliberately — the two read very differently.
- **Changing the `theme` prop rebuilds the chart** and resets interaction state (zoom range,
  highlights).
- **`vue-echarts` auto-injects base styles** into the document and renders a custom
  `<x-vue-echarts>` element. Under a shadow root or strict CSP, `vue-echarts/style.css` must be
  included manually.
- **ECharts defaults have a recognisable look.** Fine for this app; bending it to strong bespoke art
  direction means fighting the config.

## Testing

Since ECharts 5.3 there is a zero-dependency SSR mode that needs neither jsdom nor `node-canvas`:

```ts
const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 400, height: 300 })
chart.setOption(option)
const svg = chart.renderToSVGString()
```

Assert on the markup, or snapshot it. Text measurement falls back to an approximation without
`node-canvas`, so do not assert on exact label coordinates. ECharts ≥ 5.5 also fixed ESM resolution
for `echarts/core` under Vitest, so no module-resolution workaround is needed.

Reserve jsdom mounting (with the shims above) for tests that genuinely exercise component lifecycle.
Keep the SQL-result-to-option transform in its own module so the bulk of the logic is testable as
plain data.

## Rejected alternatives

| Candidate                    | Verdict                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chart.js + `vue-chartjs`** | Lighter (~25–35 kB gzipped tree-shaken) and the engine is current, but the time axis needs `chartjs-adapter-date-fns` — latest release December 2022 — plus `date-fns`, and zoom needs another plugin. Canvas-only, so jsdom tests need `node-canvas` or stubs. Also slow-moving: a year between 4.5.1 and 4.6.0, ~500 open issues. |
| **Observable Plot**          | Genuinely elegant for this data — `Plot.lineY(rows, { x: 'month', y: 'plays', stroke: 'track' })` splits the series in one line. But no Vue wrapper, no built-in zoom or axis-aligned tooltip, and still 0.6.x with no 1.0. Resize, reactivity and teardown would all be ours to write.                                             |
| **Highcharts**               | Excellent and battle-tested, but commercially licensed for anything beyond personal use. Ruled out on licence.                                                                                                                                                                                                                      |
| **ApexCharts**               | Custom non-OSI licence. Not worth the ambiguity.                                                                                                                                                                                                                                                                                    |
| **`@unovis/vue`**            | Apache-2.0 with a first-party Vue package, but an order of magnitude less adoption (326k/wk) than ECharts. No advantage that offsets that.                                                                                                                                                                                          |
| **D3 directly**              | Primitives, not charts. Everything above would have to be built.                                                                                                                                                                                                                                                                    |

## Scope note

Not every chart needs the library. Simple top-N magnitude bars — a label, a value, a percentage —
render perfectly well as a flex row of `<div>`s with `flex: value`, at zero dependency cost. The
library earns its place on charts that need scales, ticks, axis labels and zoom interaction, which
means the time-series views first.

## If this gets built

- Add `echarts` and `vue-echarts` pinned exact, per the no-carets rule, and run `pnpm install` before
  building or testing.
- Import through `echarts/core` with explicit `echarts.use([…])` from the very first commit —
  retrofitting tree-shaking later means auditing every import site.
- Keep the SQL-result-to-option transform in its own tested module, so `HISTORY_QUERIES` stays the
  contract between the database and the view.
- Decide once whether the y-axis means **plays** or **hours listened**; they rank differently, and
  `MIN_PLAY_MS` already makes "a play" a defined term.
- Name every series key, axis dimension and theme colour in one place rather than repeating string
  literals across chart configs.

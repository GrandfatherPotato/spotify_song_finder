import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { hasStoredSnapshot, openHistoryDatabase } from '../history'
import { stubHistoryDatabase } from '../test-support/history'
import HistoryItemView from './HistoryItemView.vue'

const route = reactive({ query: {} as Record<string, string> })

/** Behaves like the real router: replacing the location changes the route. */
const replace = vi.fn((to: { query: Record<string, string> }) => {
  route.query = to.query
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => route,
  RouterLink: {
    props: ['to'],
    template: '<a :href="href"><slot /></a>',
    computed: {
      href(this: { to: string | { path: string; query: Record<string, string> } }) {
        if (typeof this.to === 'string') return this.to
        return `${this.to.path}?${new URLSearchParams(this.to.query).toString()}`
      },
    },
  },
}))
vi.mock('../history', () => ({
  hasStoredSnapshot: vi.fn(),
  openHistoryDatabase: vi.fn(),
  clearHistoryStorage: vi.fn(),
}))
vi.mock('../history/export/source', () => ({
  noExportSource: () => ({ label: 'no export selected', listFiles: vi.fn() }),
}))
vi.mock('../components/HistoryProgressionChart.vue', () => ({
  default: {
    props: ['rows', 'bucket'],
    template: '<div data-testid="progression">{{ rows.length }} at {{ bucket }}</div>',
  },
}))

const hasStoredSnapshotMock = vi.mocked(hasStoredSnapshot)
const openMock = vi.mocked(openHistoryDatabase)

const TOTALS = [{ firstPlay: '2022-03-05', lastPlay: '2024-06-01' }]

const SUMMARY = [
  {
    name: 'Radiohead',
    subtitle: null,
    plays: 1284,
    hours: 87.2,
    firstPlay: '2022-04-01',
    lastPlay: '2024-05-20',
  },
]

const PROGRESSION = [
  { bucket: '2022-04-04', plays: 10, hours: 0.7 },
  { bucket: '2022-04-11', plays: 4, hours: 0.3 },
]

const SEARCH = [{ name: 'Radiohead', subtitle: null, uri: null, plays: 1284 }]

const SONGS = [
  { id: 1, name: 'Creep', subtitle: 'The Bends', uri: 'spotify:track:abc', plays: 300, hours: 20 },
  {
    id: 2,
    name: 'No Surprises',
    subtitle: 'OK Computer',
    uri: 'spotify:track:def',
    plays: 120,
    hours: 8,
  },
]

function stubDatabase(...responses: unknown[][]) {
  const answer = vi.fn().mockResolvedValue([]).mockResolvedValueOnce(TOTALS)
  for (const response of responses) answer.mockResolvedValueOnce(response)
  openMock.mockResolvedValue(stubHistoryDatabase({ query: answer }))
  return answer
}

beforeEach(() => {
  route.query = {}
  hasStoredSnapshotMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('HistoryItemView', () => {
  it('asks for something to look at when the URL names nothing', async () => {
    stubDatabase()

    render(HistoryItemView)

    expect(await screen.findByText(/Search above for an artist, song or album/)).toBeTruthy()
  })

  it('opens straight onto the artist the URL names', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase(SUMMARY, PROGRESSION)

    render(HistoryItemView)

    expect(await screen.findByText('1,284')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Radiohead', level: 1 })).toBeTruthy()
    expect(screen.getByText('87.2')).toBeTruthy()
  })

  it('opens a song from its URI, which is what survives a re-import', async () => {
    route.query = { type: 'song', uri: 'spotify:track:abc' }
    stubDatabase([{ ...SUMMARY[0], name: 'Creep', subtitle: 'Radiohead' }], PROGRESSION)

    render(HistoryItemView)

    expect(await screen.findByRole('heading', { name: 'Creep', level: 1 })).toBeTruthy()
    expect(screen.getByText('Radiohead')).toBeTruthy()
  })

  it('charts at the granularity the span earned, not always monthly', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase(SUMMARY, PROGRESSION)

    render(HistoryItemView)

    expect((await screen.findByTestId('progression')).textContent).toBe('2 at week')
    expect(screen.getByText(/One bar per a week/)).toBeTruthy()
  })

  it('writes the picked item into the URL so the view can be linked to', async () => {
    const answer = stubDatabase(SEARCH, SUMMARY, PROGRESSION)

    render(HistoryItemView)
    await screen.findByText(/Search above/)

    await fireEvent.update(screen.getByLabelText('Named'), 'radio')
    await userEvent.click(await screen.findByRole('button', { name: /Radiohead/ }))

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({
        path: '/history/item',
        query: { type: 'artist', name: 'Radiohead' },
      }),
    )
    expect(answer).toHaveBeenCalled()
  })

  it('ranks the songs beneath the chart, under their own heading', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase(SUMMARY, PROGRESSION, SONGS)

    render(HistoryItemView)

    expect(await screen.findByRole('heading', { name: 'Songs', level: 2 })).toBeTruthy()
    expect(screen.getByText('300 plays')).toBeTruthy()
    expect(screen.getByText('20 h')).toBeTruthy()
    expect(screen.getByText(/2 counted as a listen/)).toBeTruthy()
  })

  it('links each song in the breakdown to its own page, by URI', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase(SUMMARY, PROGRESSION, SONGS)

    render(HistoryItemView)
    await screen.findByRole('heading', { name: 'Songs', level: 2 })

    expect(screen.getByRole('link', { name: 'Creep' }).getAttribute('href')).toBe(
      '/history/item?type=song&uri=spotify%3Atrack%3Aabc',
    )
  })

  it('reloads when a song link changes only the query, without a remount', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    const answer = vi
      .fn()
      .mockResolvedValue([])
      .mockResolvedValueOnce(TOTALS)
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValueOnce(PROGRESSION)
      .mockResolvedValueOnce(SONGS)
      .mockResolvedValueOnce([{ ...SUMMARY[0], name: 'Creep', subtitle: 'Radiohead' }])
      .mockResolvedValueOnce(PROGRESSION)
    openMock.mockResolvedValue(stubHistoryDatabase({ query: answer }))

    render(HistoryItemView)
    await screen.findByRole('heading', { name: 'Songs', level: 2 })

    route.query = { type: 'song', uri: 'spotify:track:abc' }

    expect(await screen.findByRole('heading', { name: 'Creep', level: 1 })).toBeTruthy()
  })

  it('switches what the search looks for to match what is being shown', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase(
      SUMMARY,
      PROGRESSION,
      SONGS,
      [{ ...SUMMARY[0], name: 'Creep', subtitle: 'Radiohead' }],
      PROGRESSION,
    )

    render(HistoryItemView)
    await screen.findByRole('heading', { name: 'Songs', level: 2 })
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Artist' }).checked).toBe(true)

    route.query = { type: 'song', uri: 'spotify:track:abc' }
    await screen.findByRole('heading', { name: 'Creep', level: 1 })

    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Song' }).checked).toBe(true)
  })

  it('offers only the years the item itself was played in', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase([{ ...SUMMARY[0], firstPlay: '2023-02-01', lastPlay: '2024-05-20' }], PROGRESSION)

    render(HistoryItemView)
    await screen.findByText('1,284')

    const years = screen
      .getAllByRole('option')
      .map((option) => option.textContent?.trim())
      .filter((label) => label !== undefined && /^\d{4}$/u.test(label))

    expect(years).toEqual(['2024', '2023'])
  })

  it('names the album each song sits on', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase(SUMMARY, PROGRESSION, SONGS)

    render(HistoryItemView)
    await screen.findByRole('heading', { name: 'Songs', level: 2 })

    expect(screen.getByText('The Bends')).toBeTruthy()
    expect(screen.getByText('OK Computer')).toBeTruthy()
  })

  it('splits the songs under album subheadings, most played album first', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    stubDatabase(SUMMARY, PROGRESSION, SONGS)

    render(HistoryItemView)
    await screen.findByRole('heading', { name: 'Songs', level: 2 })

    await userEvent.click(screen.getByRole('radio', { name: 'By album' }))

    const albums = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim())

    expect(albums[0]).toMatch(/^The Bends/)
    expect(albums[1]).toMatch(/^OK Computer/)
    expect(screen.getByRole('link', { name: 'Creep' })).toBeTruthy()
  })

  it('offers no grouping on an album, which is already one', async () => {
    route.query = { type: 'album', name: 'Kid A', artist: 'Radiohead' }
    stubDatabase([{ ...SUMMARY[0], name: 'Kid A', subtitle: 'Radiohead' }], PROGRESSION, SONGS)

    render(HistoryItemView)
    await screen.findByRole('heading', { name: 'Songs', level: 2 })

    expect(screen.queryByRole('radio', { name: 'By album' })).toBeNull()
  })

  it('shows no songs section for a song, which has none of its own', async () => {
    route.query = { type: 'song', uri: 'spotify:track:abc' }
    stubDatabase([{ ...SUMMARY[0], name: 'Creep' }], PROGRESSION)

    render(HistoryItemView)
    await screen.findByRole('heading', { name: 'Creep', level: 1 })

    expect(screen.queryByRole('heading', { name: 'Songs', level: 2 })).toBeNull()
  })

  it('says so plainly when the URL names something not in the history', async () => {
    route.query = { type: 'artist', name: 'Nobody' }
    stubDatabase([{ ...SUMMARY[0], name: null, plays: 0, hours: 0 }])

    render(HistoryItemView)

    expect(await screen.findByText(/Nothing in your history matches that/)).toBeTruthy()
  })

  it('sends a visitor with no stored import back to the gate', async () => {
    hasStoredSnapshotMock.mockResolvedValue(false)

    render(HistoryItemView)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({ path: '/history', query: { notice: 'no-history' } }),
    )
    expect(openMock).not.toHaveBeenCalled()
  })

  it('surfaces a failed query instead of an empty page', async () => {
    route.query = { type: 'artist', name: 'Radiohead' }
    openMock.mockResolvedValue(
      stubHistoryDatabase({
        query: vi.fn().mockResolvedValueOnce(TOTALS).mockRejectedValue(new Error('Binder Error')),
      }),
    )

    render(HistoryItemView)

    expect((await screen.findByRole('alert')).textContent?.trim()).toBe('Binder Error')
  })
})

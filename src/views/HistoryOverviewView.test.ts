import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasStoredHistory, resetHistoryStorage, sharedHistoryDatabase } from '../history'
import { TOTALS_QUERY } from '../history/duckdb/queries'
import HistoryOverviewView from './HistoryOverviewView.vue'

const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))
vi.mock('../history', () => ({
  hasStoredHistory: vi.fn(),
  resetHistoryStorage: vi.fn(),
  sharedHistoryDatabase: vi.fn(),
}))
vi.mock('../history/export/source', () => ({
  noExportSource: () => ({ label: 'no export selected', listFiles: vi.fn() }),
}))

const hasStoredHistoryMock = vi.mocked(hasStoredHistory)
const sharedDatabaseMock = vi.mocked(sharedHistoryDatabase)

const TOTALS_ROWS = [
  {
    plays: 222902,
    trackPlays: 220544,
    heardPlays: 198203,
    episodePlays: 2347,
    audiobookPlays: 11,
    uniqueTracks: 32017,
    uniqueArtists: 9179,
    totalHours: 9430.2,
    trackHours: 9380.1,
    firstPlay: '2018-03-05',
    lastPlay: '2026-11-14',
  },
]

const QUALITY_ROWS = [{ malformedRows: 0, renamedTracks: 22, reattributedTracks: 12 }]

/** The view runs totals first, then the import-quality report. */
function stubQueries(totals = TOTALS_ROWS, quality = QUALITY_ROWS) {
  return vi.fn().mockResolvedValueOnce(totals).mockResolvedValueOnce(quality)
}

function stubDatabase(query = stubQueries()) {
  sharedDatabaseMock.mockResolvedValue({
    storage: 'OPFS (persisted)',
    origin: 'My Export',
    diagnostics: 'duckdb v1.5.4',
    query,
    runQuery: vi.fn(),
    close: vi.fn(),
  })
  return query
}

beforeEach(() => {
  hasStoredHistoryMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('HistoryOverviewView', () => {
  it('holds the page shape while the database opens, rather than a bare line of text', async () => {
    sharedDatabaseMock.mockImplementation(async (_source, onProgress) => {
      onProgress({ message: 'Restoring saved snapshot', completed: 0, total: 1 })
      return new Promise(() => undefined)
    })

    render(HistoryOverviewView)

    const progress = await screen.findByText('Restoring saved snapshot (1/1)')

    expect(progress.getAttribute('role')).toBe('status')
    expect(document.querySelectorAll('.tile')).toHaveLength(7)
    expect(screen.queryByRole('heading', { name: 'Welcome to your history' })).toBeNull()
  })

  it('replaces the placeholder with the real figures once they arrive', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    await screen.findByRole('heading', { name: 'Welcome to your history' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('welcomes the visitor and spans their listening in words', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    expect(await screen.findByRole('heading', { name: 'Welcome to your history' })).toBeTruthy()
    expect(screen.getByText(/9 years of listening/)).toBeTruthy()
    expect(screen.getByText(/5 March 2018/)).toBeTruthy()
    expect(screen.getByText(/14 November 2026/)).toBeTruthy()
  })

  it('leads on hours played, grouped for reading', async () => {
    const query = stubDatabase()

    render(HistoryOverviewView)

    expect(await screen.findByText('9,430')).toBeTruthy()
    expect(query).toHaveBeenCalledWith(TOTALS_QUERY)
  })

  it('breaks the export down into the totals behind it', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    await screen.findByText('222,902')
    expect(screen.getByText('32,017')).toBeTruthy()
    expect(screen.getByText('9,179')).toBeTruthy()
    expect(screen.getByText('2,347')).toBeTruthy()
    expect(screen.getByText('11')).toBeTruthy()
  })

  it('separates raw entries, distinct songs and plays that count as listening', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    await screen.findByText('Entries')
    expect(screen.getByText('222,902')).toBeTruthy()
    expect(screen.getByText('Different songs')).toBeTruthy()
    expect(screen.getByText('32,017')).toBeTruthy()
    expect(screen.getByText('Real listens')).toBeTruthy()
    expect(screen.getByText('198,203')).toBeTruthy()
  })

  it('names the floor that separates a listen from a skip', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    expect(await screen.findByText('song plays of 30 seconds or more')).toBeTruthy()
  })

  it('hangs the album-artist caveat off the artist figure itself', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    const trigger = await screen.findByRole('button', { name: 'About Artists' })
    const caveat = screen.getByText(/credited to the primary artist/)

    expect(caveat.getAttribute('role')).toBe('tooltip')
    expect(trigger.getAttribute('aria-describedby')).toBe(caveat.getAttribute('id'))
  })

  it('offers the query console as the way to explore for now', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    const link = await screen.findByRole('link', { name: 'Run the raw queries' })

    expect(link.getAttribute('href')).toBe('/history/test')
  })

  it('sends a visitor with no stored import back to the gate', async () => {
    hasStoredHistoryMock.mockResolvedValue(false)

    render(HistoryOverviewView)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({
        path: '/history',
        query: { notice: 'no-history' },
      }),
    )
    expect(sharedDatabaseMock).not.toHaveBeenCalled()
  })

  it('clears the stored history and says why the start page is empty', async () => {
    stubDatabase()

    render(HistoryOverviewView)
    await screen.findByRole('heading', { name: 'Welcome to your history' })

    await userEvent.click(screen.getByRole('button', { name: 'Clear storage' }))

    expect(vi.mocked(resetHistoryStorage)).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({
        path: '/',
        query: { notice: 'no-history' },
      }),
    )
  })

  it('warns what clearing costs before the click', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    const trigger = await screen.findByRole('button', { name: 'Clear storage' })
    const warning = screen.getByText(/Deletes the imported history/)

    expect(warning.getAttribute('role')).toBe('tooltip')
    expect(trigger.getAttribute('aria-describedby')).toBe(warning.getAttribute('id'))
    expect(warning.textContent).toContain('takes you back to the start')
  })

  it('counts a single year in the singular', async () => {
    stubDatabase(
      stubQueries([{ ...TOTALS_ROWS[0], firstPlay: '2026-01-01', lastPlay: '2026-04-01' }]),
    )

    render(HistoryOverviewView)

    expect(await screen.findByText(/1 year of listening/)).toBeTruthy()
  })

  it('says so plainly when the export holds no plays at all', async () => {
    stubDatabase(
      stubQueries([{ ...TOTALS_ROWS[0], plays: 0, totalHours: 0, firstPlay: '', lastPlay: '' }]),
    )

    render(HistoryOverviewView)

    expect(await screen.findByRole('heading', { name: 'Nothing to show yet' })).toBeTruthy()
    expect(screen.queryByText('Entries')).toBeNull()
  })

  it('surfaces rows the import could not place, rather than dropping them silently', async () => {
    stubDatabase(stubQueries(TOTALS_ROWS, [{ ...QUALITY_ROWS[0], malformedRows: 1403 }]))

    render(HistoryOverviewView)

    expect(await screen.findByText(/1,403 rows in the export named nothing playable/)).toBeTruthy()
  })

  it('stays quiet when every row placed cleanly', async () => {
    stubDatabase()

    render(HistoryOverviewView)

    await screen.findByText('Entries')
    expect(screen.queryByText(/named nothing playable/)).toBeNull()
  })

  it('surfaces a failed query instead of an empty page', async () => {
    stubDatabase(vi.fn().mockRejectedValue(new Error('Binder Error: no such column')))

    render(HistoryOverviewView)

    expect((await screen.findByRole('alert')).textContent?.trim()).toBe(
      'Binder Error: no such column',
    )
    expect(screen.queryByRole('heading', { name: 'Welcome to your history' })).toBeNull()
  })
})

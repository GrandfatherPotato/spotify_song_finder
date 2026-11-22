import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasStoredHistory, resetHistoryStorage, sharedHistoryDatabase } from '../history'
import { HISTORY_QUERIES } from '../history/duckdb/queries'
import HistoryView from './HistoryView.vue'

const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))
vi.mock('../history', () => ({
  sharedHistoryDatabase: vi.fn(),
  resetHistoryStorage: vi.fn(),
  hasStoredHistory: vi.fn(),
}))
vi.mock('../history/opfs', () => ({ describeOpfsRoot: vi.fn().mockResolvedValue('empty') }))
vi.mock('../history/export/source', () => ({
  noExportSource: () => ({ label: 'no export selected', listFiles: vi.fn() }),
}))

const sharedDatabaseMock = vi.mocked(sharedHistoryDatabase)
const hasStoredHistoryMock = vi.mocked(hasStoredHistory)

const TOTALS_ROWS = [{ plays: 222902, track_plays: 220544 }]
const RESET_LABEL = 'Clear stored history'

function queryButtons(): HTMLElement[] {
  return screen
    .queryAllByRole('button')
    .filter((button) => button.textContent?.trim() !== RESET_LABEL)
}

function stubDatabase(query = vi.fn().mockResolvedValue(TOTALS_ROWS)) {
  sharedDatabaseMock.mockResolvedValue({
    storage: 'OPFS (persisted)',
    origin: 'data/ (dev server)',
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

describe('HistoryView', () => {
  it('sends a visitor with no stored import back to the gate', async () => {
    hasStoredHistoryMock.mockResolvedValue(false)

    render(HistoryView)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({
        path: '/history',
        query: { notice: 'no-history' },
      }),
    )
    expect(sharedDatabaseMock).not.toHaveBeenCalled()
  })

  it('imports on arrival and reports where the data came from and where it lives', async () => {
    stubDatabase()

    render(HistoryView)

    expect(
      await screen.findByText(/Loaded from data\/ \(dev server\), stored in OPFS \(persisted\)/),
    ).toBeTruthy()
  })

  it('offers a way back to the history overview', async () => {
    stubDatabase()

    render(HistoryView)

    expect(screen.getByRole('link', { name: 'Back to your history' }).getAttribute('href')).toBe(
      '/history/overview',
    )
  })

  it('reports import progress while it reads the export', async () => {
    sharedDatabaseMock.mockImplementation(async (_source, onProgress) => {
      onProgress({ message: 'Reading Streaming_History_Audio_2018.json', completed: 0, total: 24 })
      return {
        storage: 'OPFS (persisted)',
        origin: 'data/ (dev server)',
        diagnostics: 'duckdb v1.5.4',
        query: vi.fn(),
        runQuery: vi.fn(),
        close: vi.fn(),
      }
    })

    render(HistoryView)

    expect(await screen.findByText('Reading Streaming_History_Audio_2018.json (1/24)')).toBeTruthy()
  })

  it('offers one button per named query', async () => {
    stubDatabase()

    render(HistoryView)

    await waitFor(() => expect(queryButtons()).toHaveLength(3))
    expect(queryButtons().map((button) => button.textContent?.trim())).toEqual(
      Object.keys(HISTORY_QUERIES),
    )
  })

  it('runs the clicked query and renders its rows as a table', async () => {
    const query = stubDatabase()

    render(HistoryView)

    await userEvent.click(await screen.findByRole('button', { name: 'totals' }))

    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
    expect(query).toHaveBeenCalledWith(HISTORY_QUERIES.totals)
    expect(screen.getByText('totals — 1 rows')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'track_plays' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '222902' })).toBeTruthy()
  })

  it('does not tear the database down on unmount, so navigating back is instant', async () => {
    stubDatabase()

    const first = render(HistoryView)
    await screen.findByRole('button', { name: 'totals' })
    const handle = await sharedDatabaseMock.mock.results[0].value
    first.unmount()

    expect(handle.close).not.toHaveBeenCalled()

    render(HistoryView)

    await screen.findByRole('button', { name: 'totals' })
    expect(sharedDatabaseMock).toHaveBeenCalledTimes(2)
  })

  it('clears saved storage without starting another import', async () => {
    stubDatabase()

    render(HistoryView)
    await userEvent.click(await screen.findByRole('button', { name: 'totals' }))
    expect(screen.getByRole('table')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: RESET_LABEL }))

    expect(vi.mocked(resetHistoryStorage)).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByText('Stored history cleared.')).toBeTruthy())
    expect(sharedDatabaseMock).toHaveBeenCalledOnce()
    expect(replace).not.toHaveBeenCalled()
    expect(queryButtons()).toHaveLength(0)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('offers reset after a failed import, so a bad snapshot can be cleared', async () => {
    sharedDatabaseMock.mockRejectedValue(new Error('Snapshot has no plays table'))

    render(HistoryView)

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: RESET_LABEL })).toBeTruthy()
  })

  it('surfaces a failed import instead of showing empty results', async () => {
    sharedDatabaseMock.mockRejectedValue(new Error('Manifest unavailable: 404'))

    render(HistoryView)

    expect((await screen.findByRole('alert')).textContent).toBe('Manifest unavailable: 404')
    expect(queryButtons()).toHaveLength(0)
  })

  it('surfaces a failed query without clearing the page', async () => {
    stubDatabase(vi.fn().mockRejectedValue(new Error('Binder Error: no such column')))

    render(HistoryView)

    await userEvent.click(await screen.findByRole('button', { name: 'integrity' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Binder Error: no such column')
    expect(screen.queryByRole('table')).toBeNull()
  })
})

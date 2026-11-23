import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasStoredSnapshot, openHistoryDatabase } from '../history'
import { stubHistoryDatabase } from '../test-support/history'
import HistoryLeaderboardView from './HistoryLeaderboardView.vue'

const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))
vi.mock('../history', () => ({
  hasStoredSnapshot: vi.fn(),
  openHistoryDatabase: vi.fn(),
  clearHistoryStorage: vi.fn(),
}))
vi.mock('../history/export/source', () => ({
  noExportSource: () => ({ label: 'no export selected', listFiles: vi.fn() }),
}))
vi.mock('../components/HistoryTrendChart.vue', () => ({
  default: {
    props: ['rows', 'series'],
    template:
      '<div data-testid="trend">{{ rows.length }} points, {{ series.map((s) => s.label).join() }}</div>',
  },
}))

const hasStoredSnapshotMock = vi.mocked(hasStoredSnapshot)
const openMock = vi.mocked(openHistoryDatabase)

const TOTALS = [{ firstPlay: '2022-03-05', lastPlay: '2024-06-01' }]

const ARTISTS = [
  { id: 1, name: 'Radiohead', subtitle: null, plays: 1284, hours: 87.2 },
  { id: 2, name: 'Bonobo', subtitle: null, plays: 976, hours: 71.9 },
  { id: 3, name: 'Burial', subtitle: null, plays: 512, hours: 38.8 },
]

const ALBUMS = [{ id: 10, name: 'Kid A', subtitle: 'Radiohead', plays: 410, hours: 31.4 }]

const TREND = [
  { month: '2024-01-01', id: 1, hours: 4 },
  { month: '2024-02-01', id: 2, hours: 2 },
]

function stubDatabase(...boards: unknown[][]) {
  const query = vi.fn().mockResolvedValueOnce(TOTALS)
  for (const board of boards) query.mockResolvedValueOnce(board).mockResolvedValueOnce(TREND)
  openMock.mockResolvedValue(stubHistoryDatabase({ query }))
  return query
}

beforeEach(() => {
  hasStoredSnapshotMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('HistoryLeaderboardView', () => {
  it('ranks the artists it loaded, with plays and hours against each', async () => {
    stubDatabase(ARTISTS)

    render(HistoryLeaderboardView)

    expect(await screen.findByText('Radiohead')).toBeTruthy()
    expect(screen.getByText('1,284 plays')).toBeTruthy()
    expect(screen.getByText('87.2 h')).toBeTruthy()
  })

  it('offers a year for every year the export covers, newest first', async () => {
    stubDatabase(ARTISTS)

    render(HistoryLeaderboardView)
    await screen.findByText('Radiohead')

    const years = screen
      .getAllByRole('option')
      .map((option) => option.textContent?.trim())
      .filter((label) => label !== undefined && /^\d{4}$/u.test(label))

    expect(years).toEqual(['2024', '2023', '2022'])
  })

  it('shows only as many rows as the size asks for', async () => {
    stubDatabase(ARTISTS)

    render(HistoryLeaderboardView)
    await screen.findByText('Radiohead')

    await userEvent.selectOptions(screen.getByLabelText('How many'), '3')

    expect(screen.getAllByText(/plays$/u)).toHaveLength(3)
  })

  it('names the album artist beneath the album when ranking albums', async () => {
    stubDatabase(ARTISTS, ALBUMS)

    render(HistoryLeaderboardView)
    await screen.findByText('Radiohead')

    await userEvent.click(screen.getByRole('radio', { name: 'Albums' }))

    expect(await screen.findByText('Kid A')).toBeTruthy()
    expect(screen.getByText('Radiohead')).toBeTruthy()
  })

  it('carries the album caveats only on the album board', async () => {
    stubDatabase(ARTISTS, ALBUMS)

    render(HistoryLeaderboardView)
    await screen.findByText('Radiohead')
    expect(screen.queryByText(/files singles and EPs as albums/)).toBeNull()

    await userEvent.click(screen.getByRole('radio', { name: 'Albums' }))

    expect(await screen.findByText(/files singles and EPs as albums/)).toBeTruthy()
    expect(screen.getByText(/most recent album it was seen on/)).toBeTruthy()
  })

  it('always says the floor that separates a listen from a skip', async () => {
    stubDatabase(ARTISTS)

    render(HistoryLeaderboardView)

    expect(await screen.findByText(/shorter than 30 seconds/)).toBeTruthy()
  })

  it('charts exactly the rows the size control left on the table, in rank order', async () => {
    stubDatabase(ARTISTS)

    render(HistoryLeaderboardView)
    await screen.findByText('Radiohead')

    await userEvent.selectOptions(screen.getByLabelText('How many'), '3')

    expect(screen.getByTestId('trend').textContent).toBe('2 points, Radiohead,Bonobo,Burial')
  })

  it('says so plainly when nothing in the range counted as a listen', async () => {
    stubDatabase([])

    render(HistoryLeaderboardView)

    expect(await screen.findByText(/Nothing was played for long enough/)).toBeTruthy()
  })

  it('sends a visitor with no stored import back to the gate', async () => {
    hasStoredSnapshotMock.mockResolvedValue(false)

    render(HistoryLeaderboardView)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({ path: '/history', query: { notice: 'no-history' } }),
    )
    expect(openMock).not.toHaveBeenCalled()
  })

  it('surfaces a failed query instead of an empty board', async () => {
    openMock.mockResolvedValue(
      stubHistoryDatabase({ query: vi.fn().mockRejectedValue(new Error('Binder Error')) }),
    )

    render(HistoryLeaderboardView)

    expect((await screen.findByRole('alert')).textContent?.trim()).toBe('Binder Error')
  })
})

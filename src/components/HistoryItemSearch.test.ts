import { fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEADERBOARD_ENTITY } from '../history/duckdb/queries'
import HistoryItemSearch from './HistoryItemSearch.vue'

const RESULTS = [{ name: 'Radiohead', subtitle: null, uri: null, plays: 1284 }]

function renderSearch(results: typeof RESULTS = []) {
  return render(HistoryItemSearch, {
    props: { results, searching: false, modelValue: LEADERBOARD_ENTITY.artist },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HistoryItemSearch', () => {
  it('searches once for a word typed in one go, not once per keystroke', async () => {
    const { emitted } = renderSearch()
    const input = screen.getByLabelText('Named')

    await fireEvent.update(input, 'r')
    await fireEvent.update(input, 'ra')
    await fireEvent.update(input, 'rad')
    vi.advanceTimersByTime(500)

    expect(emitted('search')).toEqual([['rad']])
  })

  it('waits before searching at all, rather than firing on the first letter', async () => {
    const { emitted } = renderSearch()

    await fireEvent.update(screen.getByLabelText('Named'), 'r')

    expect(emitted('search')).toBeUndefined()
  })

  it('searches again when the category changes, with whatever is typed', async () => {
    const { emitted } = renderSearch()
    await fireEvent.update(screen.getByLabelText('Named'), 'kid')
    vi.advanceTimersByTime(500)

    await fireEvent.click(screen.getByRole('radio', { name: 'Album' }))
    vi.advanceTimersByTime(500)

    expect(emitted('search')).toEqual([['kid'], ['kid']])
  })

  it('hands back a picked artist by name', async () => {
    const { emitted } = renderSearch(RESULTS)

    await fireEvent.click(screen.getByRole('button', { name: /Radiohead/ }))

    expect(emitted('pick')).toEqual([[{ entity: 'artist', name: 'Radiohead' }]])
  })

  it('drops a pending search when it is torn down mid-type', async () => {
    const { emitted, unmount } = renderSearch()

    await fireEvent.update(screen.getByLabelText('Named'), 'rad')
    unmount()
    vi.advanceTimersByTime(500)

    expect(emitted('search')).toBeUndefined()
  })
})

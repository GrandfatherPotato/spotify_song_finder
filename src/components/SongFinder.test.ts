import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SongFinder from './SongFinder.vue'

const searchTracks = vi.fn()
const findTrack = vi.fn()
const fetchFamiliarArtists = vi.fn()
const fetchLabels = vi.fn()
const findSimilar = vi.fn()
const isLastFmConfigured = vi.fn()

vi.mock('../spotify/library', () => ({
  searchTracks: (...args: unknown[]) => searchTracks(...args),
  findTrack: (...args: unknown[]) => findTrack(...args),
  fetchFamiliarArtists: () => fetchFamiliarArtists(),
}))

vi.mock('../lastfm/labels', () => ({
  fetchLabels: (...args: unknown[]) => fetchLabels(...args),
}))

vi.mock('../lastfm/api', () => ({
  isLastFmConfigured: () => isLastFmConfigured(),
}))

vi.mock('../discovery/find', () => ({
  findSimilar: (...args: unknown[]) => findSimilar(...args),
  MAX_TRACKS_PER_ARTIST: 4,
}))

const SEED = {
  id: 'track-1',
  title: 'Black Soul Choir',
  artists: ['16 Horsepower'],
  spotifyUrl: 'https://open.spotify.com/track/track-1',
  artworkUrl: null,
}

const LABELS = [
  { name: 'Alt-country', weight: 100, source: 'artist' as const },
  { name: 'gothic americana', weight: 60, source: 'artist' as const },
  { name: 'southern gothic', weight: 1, source: 'track' as const },
]

function result(artist: string, title: string, score: number): unknown {
  return {
    artist,
    title,
    score,
    matchedLabels: ['southern gothic'],
    labels: [{ name: 'gothic country', weight: 90, source: 'artist' as const }],
    familiar: true,
    source: 'label' as const,
    viaLabel: 'southern gothic',
  }
}

async function pickTheSeedTrack(): Promise<void> {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Find a song'), '16 Horsepower')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  await user.click(await screen.findByRole('button', { name: /Black Soul Choir/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  isLastFmConfigured.mockReturnValue(true)
  searchTracks.mockResolvedValue([SEED])
  fetchLabels.mockResolvedValue(LABELS)
  fetchFamiliarArtists.mockResolvedValue(new Set(['woven hand']))
  findSimilar.mockResolvedValue([])
  findTrack.mockResolvedValue(null)
})

describe('SongFinder', () => {
  it('asks for the Last.fm key instead of rendering the search when unconfigured', () => {
    isLastFmConfigured.mockReturnValue(false)

    render(SongFinder)

    expect(screen.getByText(/VITE_LAST_FM_API_KEY/)).toBeTruthy()
    expect(screen.queryByLabelText('Find a song')).toBeNull()
  })

  it('shows the labels for a picked song, marking where each came from', async () => {
    render(SongFinder)

    await pickTheSeedTrack()

    expect(await screen.findByRole('button', { name: /Alt-country/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /southern gothic/ })).toBeTruthy()
  })

  it('preselects the strongest labels so the search is usable immediately', async () => {
    render(SongFinder)

    await pickTheSeedTrack()

    const chip = await screen.findByRole('button', { name: /Alt-country/ })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })

  it('drops a label from the search when its chip is unticked', async () => {
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(await screen.findByRole('button', { name: /Alt-country/ }))
    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))

    await waitFor(() => expect(findSimilar).toHaveBeenCalled())
    const [options] = findSimilar.mock.calls[0] as [{ selected: Array<{ name: string }> }]
    expect(options.selected.map((label) => label.name)).toEqual([
      'gothic americana',
      'southern gothic',
    ])
  })

  it('passes the listening history through so results can be ranked by it', async () => {
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))

    await waitFor(() => expect(findSimilar).toHaveBeenCalled())
    const [options] = findSimilar.mock.calls[0] as [{ familiarArtists: Set<string> }]
    expect(options.familiarArtists.has('woven hand')).toBe(true)
  })

  it('renders each result with its own labels so the search can be refined', async () => {
    findSimilar.mockResolvedValue([result('Woven Hand', 'Sparrow Falls', 0.8)])
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))

    expect(await screen.findByText('Sparrow Falls')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'gothic country' })).toBeTruthy()
    expect(screen.getByText('in your listening')).toBeTruthy()
  })

  it('looks the song up on Spotify only when play is pressed', async () => {
    findSimilar.mockResolvedValue([result('Woven Hand', 'Sparrow Falls', 0.8)])
    findTrack.mockResolvedValue({ ...SEED, id: 'woven-1', title: 'Sparrow Falls' })
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))
    await screen.findByRole('button', { name: 'Play Sparrow Falls' })
    expect(findTrack).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Play Sparrow Falls' }))

    expect(findTrack).toHaveBeenCalledWith('Woven Hand', 'Sparrow Falls')
    const player = screen.getByTitle('Spotify player for Sparrow Falls')
    expect(player.getAttribute('src')).toBe('https://open.spotify.com/embed/track/woven-1')
  })

  it('reuses the resolved id instead of searching again on reopen', async () => {
    findSimilar.mockResolvedValue([result('Woven Hand', 'Sparrow Falls', 0.8)])
    findTrack.mockResolvedValue({ ...SEED, id: 'woven-1', title: 'Sparrow Falls' })
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))
    await user.click(await screen.findByRole('button', { name: 'Play Sparrow Falls' }))
    await user.click(screen.getByRole('button', { name: 'Close player for Sparrow Falls' }))
    await user.click(screen.getByRole('button', { name: 'Play Sparrow Falls' }))

    expect(findTrack).toHaveBeenCalledOnce()
    expect(screen.getByTitle('Spotify player for Sparrow Falls')).toBeTruthy()
  })

  it('keeps one player open at a time so two tracks cannot play at once', async () => {
    findSimilar.mockResolvedValue([
      result('Woven Hand', 'Sparrow Falls', 0.9),
      result('Woven Hand', 'Blue Pale Depths', 0.8),
    ])
    findTrack.mockResolvedValue({ ...SEED, id: 'woven-1' })
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))
    await user.click(await screen.findByRole('button', { name: 'Play Sparrow Falls' }))
    await user.click(screen.getByRole('button', { name: 'Play Blue Pale Depths' }))

    expect(screen.queryByTitle('Spotify player for Sparrow Falls')).toBeNull()
    expect(screen.getByTitle('Spotify player for Blue Pale Depths')).toBeTruthy()
  })

  it('marks a track Spotify cannot find rather than silently doing nothing', async () => {
    findSimilar.mockResolvedValue([result('Woven Hand', 'Sparrow Falls', 0.8)])
    findTrack.mockResolvedValue(null)
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))
    await user.click(await screen.findByRole('button', { name: 'Play Sparrow Falls' }))

    const button = await screen.findByRole('button', { name: 'Sparrow Falls is not on Spotify' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('not on Spotify')).toBeTruthy()
    expect(screen.queryByTitle('Spotify player for Sparrow Falls')).toBeNull()
  })

  it('reports a failed lookup without breaking the results', async () => {
    findSimilar.mockResolvedValue([result('Woven Hand', 'Sparrow Falls', 0.8)])
    findTrack.mockRejectedValue(new Error('Spotify rate limit reached.'))
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))
    await user.click(await screen.findByRole('button', { name: 'Play Sparrow Falls' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Spotify rate limit reached.')
    expect(screen.getByText('Sparrow Falls')).toBeTruthy()
  })

  it('collects one artist into a single section instead of scattering them', async () => {
    findSimilar.mockResolvedValue([
      result('Lana Del Rey', 'Ultraviolence', 0.9),
      result('Woven Hand', 'Sparrow Falls', 0.85),
      result('Lana Del Rey', 'West Coast', 0.8),
      result('Lana Del Rey', 'Shades of Cool', 0.7),
    ])
    const user = userEvent.setup()
    render(SongFinder)
    await pickTheSeedTrack()

    await user.click(screen.getByRole('button', { name: 'Find similar songs' }))

    expect(await screen.findByText('4 songs across 2 artists')).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: 'Lana Del Rey' })).toHaveLength(1)
    expect(screen.getByText('Ultraviolence')).toBeTruthy()
    expect(screen.getByText('Shades of Cool')).toBeTruthy()
  })

  it('surfaces a failed search without losing the page', async () => {
    searchTracks.mockRejectedValue(new Error('Spotify rate limit reached.'))
    const user = userEvent.setup()
    render(SongFinder)

    await user.type(screen.getByLabelText('Find a song'), 'anything')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Spotify rate limit reached.')
  })
})

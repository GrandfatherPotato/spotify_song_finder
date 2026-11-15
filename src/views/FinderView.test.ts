import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCurrentUser } from '../spotify/api'
import { SpotifyApiError } from '../spotify/errors'
import { hasStoredTokens, writeStoredTokens } from '../spotify/tokens'
import FinderView from './FinderView.vue'

const replace = vi.fn()

vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('../spotify/api', () => ({ fetchCurrentUser: vi.fn() }))
vi.mock('../components/SongFinder.vue', () => ({
  default: { template: '<div data-testid="song-finder" />' },
}))

const fetchCurrentUserMock = vi.mocked(fetchCurrentUser)

const profile = {
  id: 'wizzler',
  displayName: 'JM Wizzler',
  profileUrl: 'https://open.spotify.com/user/wizzler',
  imageUrl: 'https://i.scdn.co/image/avatar.jpg',
}

function signIn(): void {
  writeStoredTokens({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3_600_000,
    scope: 'user-read-private',
  })
}

beforeEach(() => {
  signIn()
  fetchCurrentUserMock.mockResolvedValue(profile)
})

afterEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
})

describe('FinderView', () => {
  it('names the signed-in listener and renders the finder', async () => {
    render(FinderView)

    expect(await screen.findByText('JM Wizzler')).toBeTruthy()
    expect(screen.getByTestId('song-finder')).toBeTruthy()
  })

  it('discards the stored token and returns to sign-in on sign out', async () => {
    render(FinderView)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(hasStoredTokens()).toBe(false)
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('reports a failed profile fetch without hiding the finder', async () => {
    fetchCurrentUserMock.mockRejectedValue(new SpotifyApiError('Spotify refused the request.', 403))

    render(FinderView)

    expect((await screen.findByRole('alert')).textContent).toBe('Spotify refused the request.')
    expect(screen.getByTestId('song-finder')).toBeTruthy()
  })
})

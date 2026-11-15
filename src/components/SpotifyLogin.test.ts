import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCurrentUser } from '../spotify/api'
import type * as AuthModule from '../spotify/auth'
import { beginLogin, completeLogin } from '../spotify/auth'
import { SpotifyApiError, SpotifyAuthError } from '../spotify/errors'
import { hasStoredTokens, writeStoredTokens } from '../spotify/tokens'
import SpotifyLogin from './SpotifyLogin.vue'

vi.mock('../spotify/api', () => ({ fetchCurrentUser: vi.fn() }))

vi.mock('../spotify/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  beginLogin: vi.fn(),
  completeLogin: vi.fn(),
}))

const fetchCurrentUserMock = vi.mocked(fetchCurrentUser)
const beginLoginMock = vi.mocked(beginLogin)
const completeLoginMock = vi.mocked(completeLogin)

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

function visit(url: string): void {
  window.history.replaceState({}, '', url)
}

beforeEach(() => {
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-123')
  vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5173/callback')
  visit('/')
})

afterEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.unstubAllEnvs()
})

describe('SpotifyLogin — signed out', () => {
  it('offers a Spotify sign-in', async () => {
    render(SpotifyLogin)

    expect(await screen.findByRole('button', { name: 'Continue with Spotify' })).toBeTruthy()
  })

  it('starts the authorisation redirect when clicked', async () => {
    render(SpotifyLogin)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Continue with Spotify' }))

    expect(beginLoginMock).toHaveBeenCalledOnce()
    expect(fetchCurrentUserMock).not.toHaveBeenCalled()
  })

  it('asks for a client ID when none is configured', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', '')
    render(SpotifyLogin)

    expect(await screen.findByRole('heading', { name: 'Add your client ID' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue with Spotify' })).toBeNull()
  })

  it('blocks sign-in when the redirect URI uses localhost', async () => {
    vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://localhost:5173/callback')
    render(SpotifyLogin)

    const button = await screen.findByRole('button', { name: 'Continue with Spotify' })

    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/127\.0\.0\.1/)).toBeTruthy()
  })
})

describe('SpotifyLogin — signed in', () => {
  it('shows the display name and user ID from /me', async () => {
    signIn()
    fetchCurrentUserMock.mockResolvedValue(profile)
    render(SpotifyLogin)

    expect(await screen.findByRole('heading', { name: 'JM Wizzler' })).toBeTruthy()
    expect(screen.getByText('wizzler')).toBeTruthy()
    expect(screen.getByText('Signed in as')).toBeTruthy()
  })

  it('links out to the Spotify profile', async () => {
    signIn()
    fetchCurrentUserMock.mockResolvedValue(profile)
    render(SpotifyLogin)

    const link = await screen.findByRole('link', { name: 'Open Spotify profile' })

    expect(link.getAttribute('href')).toBe('https://open.spotify.com/user/wizzler')
  })

  it('discards the stored token on sign out', async () => {
    signIn()
    fetchCurrentUserMock.mockResolvedValue(profile)
    render(SpotifyLogin)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(hasStoredTokens()).toBe(false)
    expect(screen.getByRole('button', { name: 'Continue with Spotify' })).toBeTruthy()
  })

  it('reports a failed profile fetch instead of a blank screen', async () => {
    signIn()
    fetchCurrentUserMock.mockRejectedValue(new SpotifyApiError('Spotify refused the request.', 403))
    render(SpotifyLogin)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Spotify refused the request.',
    )
  })
})

describe('SpotifyLogin — authorisation callback', () => {
  it('exchanges the code and then removes it from the address bar', async () => {
    visit('/callback?code=code-1&state=state-xyz')
    completeLoginMock.mockImplementation(async () => {
      signIn()
      return {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() + 3_600_000,
        scope: 'user-read-private',
      }
    })
    fetchCurrentUserMock.mockResolvedValue(profile)
    render(SpotifyLogin)

    expect(await screen.findByRole('heading', { name: 'JM Wizzler' })).toBeTruthy()
    expect(completeLoginMock).toHaveBeenCalledWith('?code=code-1&state=state-xyz')
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('surfaces a rejected callback and falls back to the sign-in button', async () => {
    visit('/callback?error=access_denied')
    completeLoginMock.mockRejectedValue(new SpotifyAuthError('You cancelled the Spotify sign-in.'))
    render(SpotifyLogin)

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'You cancelled the Spotify sign-in.',
    )
    expect(screen.getByRole('button', { name: 'Continue with Spotify' })).toBeTruthy()
    expect(fetchCurrentUserMock).not.toHaveBeenCalled()
  })
})

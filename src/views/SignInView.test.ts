import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginLogin } from '../spotify/auth'
import { writeStoredTokens } from '../spotify/tokens'
import SignInView from './SignInView.vue'

const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))
vi.mock('../spotify/auth', () => ({ beginLogin: vi.fn() }))

const beginLoginMock = vi.mocked(beginLogin)

beforeEach(() => {
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-123')
  vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5173/callback')
})

afterEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.unstubAllEnvs()
})

describe('SignInView', () => {
  it('offers a Spotify sign-in', async () => {
    render(SignInView)

    expect(await screen.findByRole('button', { name: 'Continue with Spotify' })).toBeTruthy()
  })

  it('starts the authorisation redirect when clicked', async () => {
    render(SignInView)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Continue with Spotify' }))

    expect(beginLoginMock).toHaveBeenCalledOnce()
  })

  it('asks for a client ID when none is configured', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', '')
    render(SignInView)

    expect(await screen.findByRole('heading', { name: 'Add your client ID' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue with Spotify' })).toBeNull()
  })

  it('blocks sign-in when the redirect URI uses localhost', async () => {
    vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://localhost:5173/callback')
    render(SignInView)

    const button = await screen.findByRole('button', { name: 'Continue with Spotify' })

    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/127\.0\.0\.1/)).toBeTruthy()
  })

  it('offers a way back to the landing page', async () => {
    render(SignInView)

    const back = await screen.findByRole('link', { name: 'Back to the start' })

    expect(back.getAttribute('href')).toBe('/')
  })

  it('sends an already-signed-in visitor straight to the finder', async () => {
    writeStoredTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 3_600_000,
      scope: 'user-read-private',
    })

    render(SignInView)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/finder'))
  })
})

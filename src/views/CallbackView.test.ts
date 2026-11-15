import { render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeLogin } from '../spotify/auth'
import { SpotifyAuthError } from '../spotify/errors'
import CallbackView from './CallbackView.vue'

const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  RouterLink: { template: '<a><slot /></a>' },
}))
vi.mock('../spotify/auth', () => ({ completeLogin: vi.fn() }))

const completeLoginMock = vi.mocked(completeLogin)

const TOKENS = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 3_600_000,
  scope: 'user-read-private',
}

beforeEach(() => {
  window.history.replaceState({}, '', '/callback?code=code-1&state=state-xyz')
})

afterEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
})

describe('CallbackView', () => {
  it('exchanges the authorisation code and moves on to the finder', async () => {
    completeLoginMock.mockResolvedValue(TOKENS)

    render(CallbackView)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/finder'))
    expect(completeLoginMock).toHaveBeenCalledWith('?code=code-1&state=state-xyz')
  })

  it('surfaces a rejected callback and offers a way back', async () => {
    completeLoginMock.mockRejectedValue(new SpotifyAuthError('You cancelled the Spotify sign-in.'))

    render(CallbackView)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'You cancelled the Spotify sign-in.',
    )
    expect(screen.getByText('Back to sign in')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })
})

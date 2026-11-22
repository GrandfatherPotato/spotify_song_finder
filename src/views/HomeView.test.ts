import { render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from './HomeView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

let query: Record<string, string> = {}

beforeEach(() => {
  query = {}
})

describe('HomeView', () => {
  it('sends the song finder to the Spotify sign-in', () => {
    render(HomeView)

    expect(screen.getByRole('link', { name: 'Song finder' }).getAttribute('href')).toBe('/sign-in')
  })

  it('sends the listening history straight to its own page', () => {
    render(HomeView)

    expect(screen.getByRole('link', { name: 'Listening history' }).getAttribute('href')).toBe(
      '/history',
    )
  })

  it('marks the finder as in progress, since Spotify sign-in will not work for everyone', () => {
    render(HomeView)

    expect(screen.getByText('In progress')).toBeTruthy()
    expect(screen.getByText(/only lets this app admit 5 accounts/)).toBeTruthy()
    expect(screen.getByText(/signing in will fail/)).toBeTruthy()
  })

  it('says which option needs a Spotify connection', () => {
    render(HomeView)

    expect(screen.getByText('Requires a Spotify connection')).toBeTruthy()
    expect(screen.getByText('No Spotify account needed')).toBeTruthy()
  })

  it('reassures the visitor that nothing leaves the browser', () => {
    render(HomeView)

    expect(screen.getByText('Everything stays in this browser.')).toBeTruthy()
    expect(screen.getByText(/no server behind this page/)).toBeTruthy()
    expect(screen.getByText(/never uploaded/)).toBeTruthy()
  })
})

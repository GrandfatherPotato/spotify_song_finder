import { render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTICE } from '../../notices'
import NoticeBanner from './NoticeBanner.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ query }) }))

let query: Record<string, unknown> = {}

beforeEach(() => {
  query = {}
})

describe('NoticeBanner', () => {
  it('says nothing when the route carries no notice', () => {
    render(NoticeBanner)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('explains why the visitor was sent here', () => {
    query = { notice: NOTICE.noHistory }

    render(NoticeBanner)

    expect(screen.getByRole('status').textContent).toContain('No historical data found.')
  })

  it('ignores a notice it does not recognise rather than rendering a blank bar', () => {
    query = { notice: 'something-invented' }

    render(NoticeBanner)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ignores a key borrowed from the prototype chain', () => {
    query = { notice: 'constructor' }

    render(NoticeBanner)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ignores a repeated parameter, which arrives as an array', () => {
    query = { notice: [NOTICE.noHistory, NOTICE.noHistory] }

    render(NoticeBanner)

    expect(screen.queryByRole('status')).toBeNull()
  })
})

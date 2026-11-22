import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import StatTile from './StatTile.vue'

const TILE = {
  label: 'Artists',
  value: '9,179',
  note: 'by album artist',
}

const CAVEAT = 'Spotify records the album artist, not the track artist.'

describe('StatTile', () => {
  it('shows the figure, what it counts and the note beneath it', () => {
    render(StatTile, { props: TILE })

    expect(screen.getByText('9,179')).toBeTruthy()
    expect(screen.getByText('Artists')).toBeTruthy()
    expect(screen.getByText('by album artist')).toBeTruthy()
  })

  it('carries no caveat affordance when the figure needs no qualifying', () => {
    render(StatTile, { props: TILE })

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('describes the figure with its caveat rather than footnoting the page', () => {
    render(StatTile, { props: { ...TILE, caveat: CAVEAT } })

    const trigger = screen.getByRole('button', { name: 'About Artists' })
    const tooltip = screen.getByRole('tooltip')

    expect(tooltip.textContent?.trim()).toBe(CAVEAT)
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.getAttribute('id'))
  })

  it('gives each tile its own caveat id, so two on a page stay distinct', () => {
    render({
      components: { StatTile },
      data: () => ({ tile: { ...TILE, caveat: CAVEAT } }),
      template: '<div><StatTile v-bind="tile" /><StatTile v-bind="tile" /></div>',
    })

    const [first, second] = screen.getAllByRole('tooltip')

    expect(first.getAttribute('id')).toBeTruthy()
    expect(first.getAttribute('id')).not.toBe(second.getAttribute('id'))
  })
})

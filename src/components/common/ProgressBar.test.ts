import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ProgressBar from './ProgressBar.vue'

describe('ProgressBar', () => {
  it('reports where it is against the whole job', () => {
    render(ProgressBar, {
      props: { label: 'Reading Streaming_History_Audio_2019.json', completed: 6, total: 24 },
    })

    const bar = screen.getByRole('progressbar')

    expect(bar.getAttribute('aria-valuenow')).toBe('6')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('24')
    expect(screen.getByText('6 / 24')).toBeTruthy()
    expect(screen.getByText('Reading Streaming_History_Audio_2019.json')).toBeTruthy()
  })

  it('fills in proportion to the work done', () => {
    render(ProgressBar, { props: { label: 'Loading plays', completed: 3, total: 4 } })

    expect(screen.getByRole('progressbar').querySelector('span')?.getAttribute('style')).toContain(
      'width: 75%',
    )
  })

  it('claims no position when the total is not known yet', () => {
    render(ProgressBar, { props: { label: 'Checking the files…' } })

    const bar = screen.getByRole('progressbar')

    expect(bar.getAttribute('aria-valuenow')).toBeNull()
    expect(bar.getAttribute('aria-valuemax')).toBeNull()
    expect(screen.queryByText(/\//)).toBeNull()
  })

  it('never overfills, whatever the caller counts', () => {
    render(ProgressBar, { props: { label: 'Loading plays', completed: 9, total: 4 } })

    expect(screen.getByRole('progressbar').querySelector('span')?.getAttribute('style')).toContain(
      'width: 100%',
    )
  })
})

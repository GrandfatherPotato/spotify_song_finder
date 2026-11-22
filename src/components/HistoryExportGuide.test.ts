import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import HistoryExportGuide from './HistoryExportGuide.vue'

const TRIGGER_LABEL = 'Don’t have it yet?'
const PRIVACY_URL = 'https://www.spotify.com/us/account/privacy/'

async function openGuide(): Promise<HTMLElement> {
  render(HistoryExportGuide)
  await userEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }))
  return screen.getByRole('dialog')
}

describe('HistoryExportGuide', () => {
  it('stays shut until it is asked for', () => {
    render(HistoryExportGuide)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: TRIGGER_LABEL })).toBeTruthy()
  })

  it('links the page Spotify actually downloads the export from', async () => {
    const guide = await openGuide()

    const link = within(guide).getByRole('link', { name: 'your Spotify privacy settings' })

    expect(link.getAttribute('href')).toBe(PRIVACY_URL)
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('names the option to tick, which is not the one most people reach for', async () => {
    const guide = await openGuide()

    expect(within(guide).getByText('Extended streaming history')).toBeTruthy()
    expect(within(guide).getByText('Account data')).toBeTruthy()
  })

  it('closes again', async () => {
    const guide = await openGuide()

    await userEvent.click(within(guide).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

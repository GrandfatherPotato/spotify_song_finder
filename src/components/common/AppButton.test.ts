import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AppButton, { BUTTON_SIZE, BUTTON_TYPE, BUTTON_VARIANT } from './AppButton.vue'

function classesOf(name: string): string {
  return screen.getByRole('button', { name }).className
}

describe('AppButton', () => {
  it('is a plain, non-submitting button unless told otherwise', () => {
    render(AppButton, { slots: { default: 'Sign out' } })

    const button = screen.getByRole('button', { name: 'Sign out' })

    expect(button.getAttribute('type')).toBe('button')
    expect(button.className).toContain('button--ghost')
    expect(button.className).toContain('button--small')
  })

  it('submits the surrounding form when asked', () => {
    render(AppButton, { props: { type: BUTTON_TYPE.submit }, slots: { default: 'Search' } })

    expect(screen.getByRole('button', { name: 'Search' }).getAttribute('type')).toBe('submit')
  })

  it('carries the variant and size it was given', () => {
    render(AppButton, {
      props: { variant: BUTTON_VARIANT.primary, size: BUTTON_SIZE.medium },
      slots: { default: 'Continue' },
    })

    expect(classesOf('Continue')).toContain('button--primary')
    expect(classesOf('Continue')).toContain('button--medium')
  })

  it('passes attributes it does not own through to the element', () => {
    render(AppButton, { attrs: { disabled: true }, slots: { default: 'Find' } })

    expect((screen.getByRole('button', { name: 'Find' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('reports clicks, and stays silent while disabled', async () => {
    const onClick = vi.fn()
    render(AppButton, { attrs: { onClick }, slots: { default: 'Clear' } })

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClick).toHaveBeenCalledOnce()
  })
})

import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import Tooltip, { TOOLTIP_PLACEMENT } from './Tooltip.vue'

const TEXT = 'Deletes the imported history from this browser.'

function renderWithTrigger(props: Record<string, unknown> = {}) {
  return render(Tooltip, {
    props: { text: TEXT, ...props },
    slots: {
      default: `<template #default="{ describedby }">
        <button type="button" :aria-describedby="describedby">Clear storage</button>
      </template>`,
    },
  })
}

describe('Tooltip', () => {
  it('describes the trigger it wraps', () => {
    renderWithTrigger()

    const trigger = screen.getByRole('button', { name: 'Clear storage' })
    const tooltip = screen.getByRole('tooltip')

    expect(tooltip.textContent?.trim()).toBe(TEXT)
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.getAttribute('id'))
  })

  it('sits above its trigger unless told otherwise', () => {
    renderWithTrigger()

    expect(screen.getByRole('tooltip').className).toContain('tooltip__text--top')
  })

  it('can hang below, for a trigger with nothing above it', () => {
    renderWithTrigger({ placement: TOOLTIP_PLACEMENT.bottom })

    expect(screen.getByRole('tooltip').className).toContain('tooltip__text--bottom')
  })
})

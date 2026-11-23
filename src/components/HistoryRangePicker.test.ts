import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { customRange, yearRange } from '../history/range'
import type { TimeRange } from '../history/range'
import HistoryRangePicker from './HistoryRangePicker.vue'

const YEARS = [2024, 2023, 2022]

function renderPicker(modelValue: TimeRange | null) {
  return render(HistoryRangePicker, { props: { modelValue, years: YEARS } })
}

function whenSelect(): HTMLSelectElement {
  return screen.getByLabelText('When')
}

describe('HistoryRangePicker', () => {
  it('starts on all time when no range is set', () => {
    renderPicker(null)

    expect(whenSelect().value).toBe('all-time')
  })

  it('shows the year it was given rather than resetting to all time', () => {
    renderPicker(yearRange(2024))

    expect(whenSelect().value).toBe('2024')
  })

  it('reopens a custom range on the dates the user picked', () => {
    renderPicker(customRange('2024-03-01', '2024-03-31'))

    expect(whenSelect().value).toBe('custom')
    expect(screen.getByLabelText<HTMLInputElement>('From').value).toBe('2024-03-01')
    expect(screen.getByLabelText<HTMLInputElement>('To').value).toBe('2024-03-31')
  })

  it('emits the whole year when a year is chosen', async () => {
    const { emitted } = renderPicker(null)

    await userEvent.selectOptions(whenSelect(), '2023')

    expect(emitted('update:modelValue')).toEqual([[yearRange(2023)]])
  })

  it('goes back to all time without holding on to the old range', async () => {
    const { emitted } = renderPicker(yearRange(2024))

    await userEvent.selectOptions(whenSelect(), 'all-time')

    expect(emitted('update:modelValue')).toEqual([[null]])
  })

  it('says what is wrong with a backwards range instead of emitting one', async () => {
    const { emitted } = renderPicker(null)

    await userEvent.selectOptions(whenSelect(), 'custom')
    await userEvent.type(screen.getByLabelText('From'), '2024-03-31')
    await userEvent.type(screen.getByLabelText('To'), '2024-03-01')

    expect(screen.getByText('Pick a start date on or before the end date.')).toBeTruthy()
    expect(emitted('update:modelValue')).toBeUndefined()
  })
})

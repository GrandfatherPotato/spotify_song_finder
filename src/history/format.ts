const counts = new Intl.NumberFormat('en-GB')

const dates = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatCount(value: number): string {
  return counts.format(Math.round(value))
}

export function formatHours(value: number): string {
  return counts.format(value)
}

/** Pinned to UTC: the dates arrive as plain `YYYY-MM-DD`, and a westward
    timezone would otherwise render them a day early. */
export function formatDate(iso: string): string {
  const parsed = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(parsed) ? '—' : dates.format(parsed)
}

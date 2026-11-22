import { describe, expect, it } from 'vitest'
import { APP_NAME, ROUTE_NAME, documentTitle } from './routes'

describe('documentTitle', () => {
  it('names the page in the tab, since the pages no longer say it themselves', () => {
    expect(documentTitle(ROUTE_NAME.historyOverview)).toBe(`Listening history · ${APP_NAME}`)
    expect(documentTitle(ROUTE_NAME.historyTest)).toBe(`Query console · ${APP_NAME}`)
  })

  it('shows the app alone on the landing page', () => {
    expect(documentTitle(ROUTE_NAME.home)).toBe(APP_NAME)
  })

  it('falls back to the app name for an unnamed or unknown route', () => {
    expect(documentTitle(undefined)).toBe(APP_NAME)
    expect(documentTitle('not-a-route')).toBe(APP_NAME)
  })

  it('gives every route a title or a deliberate fallback', () => {
    for (const name of Object.values(ROUTE_NAME)) {
      expect(documentTitle(name).endsWith(APP_NAME)).toBe(true)
    }
  })
})

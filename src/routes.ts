// Separate from router.ts, which imports the view components: those views need
// these paths, and importing them back from router.ts would be a cycle.
export const ROUTE_PATH = {
  home: '/',
  signIn: '/sign-in',
  callback: '/callback',
  finder: '/finder',
  history: '/history',
  historyOverview: '/history/overview',
  historyLeaderboard: '/history/leaderboard',
  historyTest: '/history/test',
} as const

export const ROUTE_NAME = {
  home: 'home',
  signIn: 'sign-in',
  callback: 'callback',
  finder: 'finder',
  history: 'history',
  historyOverview: 'history-overview',
  historyLeaderboard: 'history-leaderboard',
  historyTest: 'history-test',
} as const

/** Mirrored by the static `<title>` in index.html, which shows before Vue runs. */
export const APP_NAME = 'Backtrack'

/** Where a page says what it is. Absent means the app name on its own. */
const ROUTE_TITLE: Record<string, string> = {
  [ROUTE_NAME.signIn]: 'Sign in',
  [ROUTE_NAME.callback]: 'Signing in',
  [ROUTE_NAME.finder]: 'Song finder',
  [ROUTE_NAME.history]: 'Load your listening history',
  [ROUTE_NAME.historyOverview]: 'Listening history',
  [ROUTE_NAME.historyLeaderboard]: 'Top of the lot',
  [ROUTE_NAME.historyTest]: 'Query console',
}

export function documentTitle(routeName: unknown): string {
  if (typeof routeName !== 'string') return APP_NAME
  // Own-property only: a plain lookup resolves inherited keys like `toString`.
  if (!Object.hasOwn(ROUTE_TITLE, routeName)) return APP_NAME
  return `${ROUTE_TITLE[routeName]} · ${APP_NAME}`
}

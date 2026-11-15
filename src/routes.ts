// Separate from router.ts, which imports the view components: those views need
// these paths, and importing them back from router.ts would be a cycle.
export const ROUTE_PATH = {
  signIn: '/',
  callback: '/callback',
  finder: '/finder',
} as const

export const ROUTE_NAME = {
  signIn: 'sign-in',
  callback: 'callback',
  finder: 'finder',
} as const

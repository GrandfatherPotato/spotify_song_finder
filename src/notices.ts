/**
 * Messages a redirect can carry to its destination, so a page the user did not
 * ask for can say why they are looking at it.
 *
 * Kept in the URL rather than in module state: a redirect survives the reload
 * that module state would not, and the banner stays explainable from the
 * address bar alone.
 */
export const NOTICE_PARAM = 'notice'

export const NOTICE = {
  noHistory: 'no-history',
} as const

export type Notice = (typeof NOTICE)[keyof typeof NOTICE]

const NOTICE_MESSAGE: Record<Notice, string> = {
  [NOTICE.noHistory]: 'No historical data found.',
}

/**
 * Null for an absent, repeated or unrecognised parameter. The own-property
 * check matters: the value comes from the URL, and a plain lookup would return
 * `Object.prototype.constructor` for `?notice=constructor`.
 */
export function noticeMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!Object.hasOwn(NOTICE_MESSAGE, value)) return null
  return NOTICE_MESSAGE[value as Notice]
}

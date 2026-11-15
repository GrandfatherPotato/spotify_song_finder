export class SpotifyAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpotifyAuthError'
  }
}

export class SpotifyApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong talking to Spotify.'
}

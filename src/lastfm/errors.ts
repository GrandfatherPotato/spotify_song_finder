export class LastFmError extends Error {
  readonly code: number | null

  constructor(message: string, code: number | null = null) {
    super(message)
    this.name = 'LastFmError'
    this.code = code
  }
}

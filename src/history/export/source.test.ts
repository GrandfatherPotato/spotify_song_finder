import { afterEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_MANIFEST_PATH } from './manifest'
import { devDataSource, fileListSource } from './source'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(responses: Record<string, { ok: boolean; body: unknown }>) {
  const fetchMock = vi.fn(async (url: string) => {
    const response = responses[url]
    if (response === undefined) throw new Error(`Unexpected fetch: ${url}`)
    return {
      ok: response.ok,
      status: response.ok ? 200 : 404,
      json: async () => response.body,
      text: async () => String(response.body),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('devDataSource', () => {
  it('reads the manifest and defers file reads until asked', async () => {
    const fetchMock = stubFetch({
      [HISTORY_MANIFEST_PATH]: {
        ok: true,
        body: {
          files: [{ name: 'Streaming_History_Audio_2018.json', url: '/data/a.json', bytes: 7 }],
        },
      },
      '/data/a.json': { ok: true, body: '[]' },
    })

    const files = await devDataSource().listFiles()

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('Streaming_History_Audio_2018.json')
    expect(files[0].bytes).toBe(7)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await expect(files[0].readText()).resolves.toBe('[]')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports a missing manifest rather than returning nothing', async () => {
    stubFetch({ [HISTORY_MANIFEST_PATH]: { ok: false, body: null } })

    await expect(devDataSource().listFiles()).rejects.toThrow('Manifest unavailable: 404')
  })
})

describe('fileListSource', () => {
  it('keeps only Streaming_History JSON files', async () => {
    const picked = [
      new File(['[]'], 'Streaming_History_Audio_2018.json'),
      new File(['[]'], 'Streaming_History_Video_2021.json'),
      new File(['x'], 'ReadMeFirst_ExtendedStreamingHistory.pdf'),
      new File(['x'], 'Userdata.json'),
    ]

    const files = await fileListSource(picked).listFiles()

    expect(files.map((file) => file.name)).toEqual([
      'Streaming_History_Audio_2018.json',
      'Streaming_History_Video_2021.json',
    ])
  })
})

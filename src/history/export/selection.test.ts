import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { selectedExportSource } from './selection'

const PLAYS = JSON.stringify([
  { ts: '2024-01-01T00:00:00Z', ms_played: 189000, spotify_track_uri: 'spotify:track:1' },
])

/** A folder input reports each file's path relative to the folder picked. */
function pickedFile(path: string, content = PLAYS): File {
  const file = new File([content], path.split('/').pop() ?? path)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

function zipOf(entries: Record<string, string>, name = 'my-spotify-data.zip'): File {
  const packed = Object.fromEntries(
    Object.entries(entries).map(([path, content]) => [path, strToU8(content)]),
  )
  return new File([zipSync(packed)], name)
}

describe('selectedExportSource', () => {
  it('accepts a picked folder and labels the source with its name', async () => {
    const source = await selectedExportSource([
      pickedFile('my listening dump/Streaming_History_Audio_2024.json'),
      pickedFile('my listening dump/Streaming_History_Audio_2025.json'),
      pickedFile('my listening dump/ReadMeFirst_ExtendedStreamingHistory.pdf', 'not json'),
    ])

    expect(source.label).toBe('my listening dump')
    expect((await source.listFiles()).map((file) => file.name)).toEqual([
      'Streaming_History_Audio_2024.json',
      'Streaming_History_Audio_2025.json',
    ])
  })

  it('accepts a zip, whatever it and its inner folder are called', async () => {
    const source = await selectedExportSource([
      zipOf({
        'some other name/Streaming_History_Audio_2024.json': PLAYS,
        'some other name/ReadMeFirst_ExtendedStreamingHistory.pdf': 'not json',
      }),
    ])

    expect(source.label).toBe('my-spotify-data.zip')
    const files = await source.listFiles()
    expect(files.map((file) => file.name)).toEqual(['Streaming_History_Audio_2024.json'])
    await expect(files[0].readText()).resolves.toBe(PLAYS)
  })

  it('refuses a folder holding no history files, naming the folder', async () => {
    const selected = [pickedFile('holiday photos/beach.json', '[]')]

    await expect(selectedExportSource(selected)).rejects.toThrow(
      'No Spotify streaming-history files were found in holiday photos.',
    )
  })

  it('refuses a zip holding no history files', async () => {
    const selected = [zipOf({ 'notes.txt': 'nothing to see' }, 'archive.zip')]

    await expect(selectedExportSource(selected)).rejects.toThrow(
      'No Spotify streaming-history files were found in archive.zip.',
    )
  })

  it('refuses an export with video history but no audio history', async () => {
    const selected = [pickedFile('My Export/Streaming_History_Video_2021.json')]

    await expect(selectedExportSource(selected)).rejects.toThrow(
      'My Export holds video history but no audio history, so there are no listens to show.',
    )
  })

  it('refuses right-named files holding the wrong thing', async () => {
    const selected = [
      pickedFile('My Export/Streaming_History_Audio_2024.json', JSON.stringify([{ played: 1 }])),
    ]

    await expect(selectedExportSource(selected)).rejects.toThrow(
      'Streaming_History_Audio_2024.json has no ts or ms_played field, so it is not streaming history.',
    )
  })

  it('refuses an empty selection', async () => {
    await expect(selectedExportSource([])).rejects.toThrow('Nothing was selected.')
  })
})

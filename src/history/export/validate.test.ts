import { describe, expect, it } from 'vitest'
import { exportFileName, findContentProblem, findExportProblem, isExportFileName } from './validate'

describe('isExportFileName', () => {
  it('matches a history file at any depth, under any folder name', () => {
    expect(isExportFileName('Streaming_History_Audio_2024.json')).toBe(true)
    expect(isExportFileName('whatever i named it/Streaming_History_Audio_2024_1.json')).toBe(true)
    expect(isExportFileName('a/b/Streaming_History_Video_2021.json')).toBe(true)
  })

  it('rejects the rest of the export', () => {
    expect(isExportFileName('ReadMeFirst_ExtendedStreamingHistory.pdf')).toBe(false)
    expect(isExportFileName('Userdata.json')).toBe(false)
    expect(isExportFileName('Streaming_History_Audio_2024.json.txt')).toBe(false)
  })
})

describe('exportFileName', () => {
  it('keeps only the final segment of a zip entry path', () => {
    expect(exportFileName('My Export/Streaming_History_Audio_2024.json')).toBe(
      'Streaming_History_Audio_2024.json',
    )
    expect(exportFileName('Streaming_History_Audio_2024.json')).toBe(
      'Streaming_History_Audio_2024.json',
    )
  })
})

describe('findExportProblem', () => {
  it('accepts a folder holding audio history', () => {
    expect(
      findExportProblem('My Export', [
        'Streaming_History_Audio_2024.json',
        'Streaming_History_Video_2024.json',
      ]),
    ).toBeNull()
  })

  it('names the container when it holds no history files', () => {
    expect(findExportProblem('holiday-photos', [])).toBe(
      'No Spotify streaming-history files were found in holiday-photos.',
    )
  })

  it('rejects an export with video history but no audio history', () => {
    expect(findExportProblem('My Export', ['Streaming_History_Video_2021.json'])).toBe(
      'My Export holds video history but no audio history, so there are no listens to show.',
    )
  })
})

describe('findContentProblem', () => {
  it('accepts a file whose plays carry the fields every play has', () => {
    const text = JSON.stringify([{ ts: '2024-01-01T00:00:00Z', ms_played: 1000 }])

    expect(findContentProblem('Streaming_History_Audio_2024.json', text)).toBeNull()
  })

  it('accepts an empty year, which proves nothing either way', () => {
    expect(findContentProblem('Streaming_History_Audio_2024.json', '[]')).toBeNull()
  })

  it('reports a file that is not JSON at all', () => {
    expect(findContentProblem('Streaming_History_Audio_2024.json', 'not json')).toBe(
      'Streaming_History_Audio_2024.json is not valid JSON.',
    )
  })

  it('reports JSON that is not a list of plays', () => {
    expect(findContentProblem('Streaming_History_Audio_2024.json', '{"plays":[]}')).toBe(
      'Streaming_History_Audio_2024.json is not a list of plays.',
    )
  })

  it('names the missing fields when the rows are the wrong shape', () => {
    const text = JSON.stringify([{ artist: 'Someone' }])

    expect(findContentProblem('Streaming_History_Audio_2024.json', text)).toBe(
      'Streaming_History_Audio_2024.json has no ts or ms_played field, so it is not streaming history.',
    )
  })

  it('reports rows that are not records', () => {
    expect(findContentProblem('Streaming_History_Audio_2024.json', '[1, 2]')).toBe(
      'Streaming_History_Audio_2024.json does not hold play records.',
    )
  })
})

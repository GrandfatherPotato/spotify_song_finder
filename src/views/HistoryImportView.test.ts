import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLocalEnvironment } from '../env'
import { hasStoredSnapshot, openHistoryDatabase } from '../history'
import { stubHistoryDatabase } from '../test-support/history'
import HistoryImportView from './HistoryImportView.vue'

const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => ({ query }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

let query: Record<string, string> = {}
vi.mock('../history', () => ({
  hasStoredSnapshot: vi.fn(),
  openHistoryDatabase: vi.fn(),
  clearHistoryStorage: vi.fn(),
}))
vi.mock('../env', () => ({ isLocalEnvironment: vi.fn() }))

const hasStoredHistoryMock = vi.mocked(hasStoredSnapshot)
const sharedDatabaseMock = vi.mocked(openHistoryDatabase)
const isLocalEnvironmentMock = vi.mocked(isLocalEnvironment)

const LOCAL_IMPORT_LABEL = 'Import from data/'
const GUIDE_TRIGGER_LABEL = 'Don’t have it yet?'

const PLAYS = JSON.stringify([
  { ts: '2024-01-01T00:00:00Z', ms_played: 189000, spotify_track_uri: 'spotify:track:1' },
])

const FOLDER_LABEL = 'Pick the folder'

function pickedFile(path: string, content = PLAYS): File {
  const file = new File([content], path.split('/').pop() ?? path)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

function stubDatabase() {
  sharedDatabaseMock.mockResolvedValue(stubHistoryDatabase())
}

beforeEach(() => {
  query = {}
  hasStoredHistoryMock.mockResolvedValue(false)
  isLocalEnvironmentMock.mockReturnValue(false)
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('HistoryImportView', () => {
  it('skips the picker and moves on when an import is already stored', async () => {
    hasStoredHistoryMock.mockResolvedValue(true)

    render(HistoryImportView)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/history/overview'))
    expect(screen.queryByLabelText(FOLDER_LABEL)).toBeNull()
  })

  it('asks for the export when nothing is stored', async () => {
    render(HistoryImportView)

    expect(await screen.findByLabelText(FOLDER_LABEL)).toBeTruthy()
    expect(screen.getByLabelText('Pick the .zip')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('imports a picked folder and moves on to the history', async () => {
    stubDatabase()
    render(HistoryImportView)

    await userEvent.upload(await screen.findByLabelText(FOLDER_LABEL), [
      pickedFile('My Export/Streaming_History_Audio_2024.json'),
    ])

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/history/overview'))
    expect(sharedDatabaseMock.mock.calls[0][0].label).toBe('My Export')
  })

  it('tracks the import file by file rather than spinning blindly', async () => {
    sharedDatabaseMock.mockImplementation(async (_source, onProgress) => {
      onProgress({ message: 'Reading Streaming_History_Audio_2019.json', completed: 5, total: 24 })
      return new Promise(() => undefined)
    })
    render(HistoryImportView)

    await userEvent.upload(await screen.findByLabelText(FOLDER_LABEL), [
      pickedFile('My Export/Streaming_History_Audio_2024.json'),
    ])

    await screen.findByText('Reading Streaming_History_Audio_2019.json')
    const bar = screen.getByRole('progressbar')

    expect(bar.getAttribute('aria-valuenow')).toBe('6')
    expect(bar.getAttribute('aria-valuemax')).toBe('24')
    expect(replace).not.toHaveBeenCalled()
  })

  it('says what is wrong with a folder that is not an export, and asks again', async () => {
    render(HistoryImportView)

    await userEvent.upload(await screen.findByLabelText(FOLDER_LABEL), [
      pickedFile('holiday photos/beach.json', '[]'),
    ])

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No Spotify streaming-history files were found in holiday photos.',
    )
    expect(sharedDatabaseMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(FOLDER_LABEL)).toBeTruthy()
  })

  it('surfaces a failed import without losing the picker', async () => {
    sharedDatabaseMock.mockRejectedValue(new Error('Built 10 plays but the database holds 0'))
    render(HistoryImportView)

    await userEvent.upload(await screen.findByLabelText(FOLDER_LABEL), [
      pickedFile('My Export/Streaming_History_Audio_2024.json'),
    ])

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Built 10 plays but the database holds 0',
    )
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByLabelText(FOLDER_LABEL)).toBeTruthy()
  })

  it('offers the repo export when running locally', async () => {
    isLocalEnvironmentMock.mockReturnValue(true)
    stubDatabase()
    render(HistoryImportView)

    await userEvent.click(await screen.findByRole('button', { name: LOCAL_IMPORT_LABEL }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/history/overview'))
    expect(sharedDatabaseMock.mock.calls[0][0].label).toBe('data/ (dev server)')
  })

  it('hides the repo export anywhere but local, leaving only the file pickers', async () => {
    render(HistoryImportView)

    await screen.findByLabelText(FOLDER_LABEL)

    expect(screen.queryByRole('button', { name: LOCAL_IMPORT_LABEL })).toBeNull()
  })

  it('offers the guide to anyone who has no export yet', async () => {
    render(HistoryImportView)

    expect(await screen.findByRole('button', { name: GUIDE_TRIGGER_LABEL })).toBeTruthy()
  })

  it('spells out the format it expects', async () => {
    render(HistoryImportView)

    expect(await screen.findByText(/Streaming_History_Audio_2024\.json/)).toBeTruthy()
  })

  it('promises the export stays on the device', async () => {
    render(HistoryImportView)

    expect(screen.getByText(/never leaves this browser/)).toBeTruthy()
  })
})

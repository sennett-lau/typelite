import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { PresetShareExportDialog } from '../PresetShareExportDialog'
import { PresetShareImportDialog } from '../PresetShareImportDialog'
import { PresetShareButtons } from '../PresetShareButtons'
import {
  shareErrorMessage,
  withImportedPresets,
  type ImportPreview,
  type ImportResult,
} from '../../../lib/presetShare'
import { useAppStore, type AiPreset } from '../../../stores/appStore'
import { translate } from '../../../test-utils/i18nMock'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const invokeMock = vi.mocked(invoke)

const CANDIDATES = [
  { id: 'a', name: 'Groq', host: 'api.groq.com' },
  { id: 'b', name: 'Office PC', host: 'office-pc.example:11434' },
]

const PREVIEW: ImportPreview = {
  fileName: 'shared.typelite-presets.json',
  entries: [
    { index: 0, name: 'Groq', host: 'api.groq.com', model: 'llama', hasKey: true },
    { index: 1, name: 'Office PC', host: 'office-pc.example:11434', model: 'qwen', hasKey: false },
  ],
  skippedUnknown: 2,
  otherServiceCount: 1,
}

function checkbox(name: string) {
  return screen.getByRole('checkbox', { name: new RegExp(name) })
}

beforeEach(() => {
  invokeMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('export options', () => {
  it('ticks every preset and leaves API keys out by default', () => {
    const onExport = vi.fn()
    render(
      <PresetShareExportDialog
        candidates={CANDIDATES}
        busy={false}
        error={null}
        unsavedChanges={false}
        onCancel={vi.fn()}
        onExport={onExport}
      />,
    )
    expect(checkbox('Groq')).toBeChecked()
    expect(checkbox('Office PC')).toBeChecked()
    expect(checkbox('Include API keys')).not.toBeChecked()
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Export…' }))
    expect(onExport).toHaveBeenCalledWith(['a', 'b'], false)
  })

  it('warns when API keys are included and exports only the ticked presets', () => {
    const onExport = vi.fn()
    render(
      <PresetShareExportDialog
        candidates={CANDIDATES}
        busy={false}
        error={null}
        unsavedChanges
        onCancel={vi.fn()}
        onExport={onExport}
      />,
    )
    fireEvent.click(checkbox('Include API keys'))
    expect(screen.getByRole('alert')).toHaveTextContent('Anyone who gets this file')
    expect(screen.getByText(/Unsaved changes are not exported/)).toBeInTheDocument()

    fireEvent.click(checkbox('Groq'))
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }))
    expect(onExport).toHaveBeenCalledWith(['b'], true)
  })

  it('cannot export with nothing ticked', () => {
    render(
      <PresetShareExportDialog
        candidates={CANDIDATES}
        busy={false}
        error={null}
        unsavedChanges={false}
        onCancel={vi.fn()}
        onExport={vi.fn()}
      />,
    )
    fireEvent.click(checkbox('Groq'))
    fireEvent.click(checkbox('Office PC'))
    expect(screen.getByRole('button', { name: 'Export…' })).toBeDisabled()
  })

  it('explains when there is nothing to export', () => {
    render(
      <PresetShareExportDialog
        candidates={[]}
        busy={false}
        error={null}
        unsavedChanges={false}
        onCancel={vi.fn()}
        onExport={vi.fn()}
      />,
    )
    expect(screen.getByText(/no saved presets to export/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('import review list', () => {
  it('lists name and host of each entry, ticked, and adds only the ticked ones', () => {
    const onConfirm = vi.fn()
    render(
      <PresetShareImportDialog
        service="ai"
        preview={PREVIEW}
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    const list = screen.getByRole('list', { name: 'Presets in the file' })
    expect(within(list).getByText('Groq')).toBeInTheDocument()
    expect(within(list).getByText('api.groq.com · llama')).toBeInTheDocument()
    expect(within(list).getByText('office-pc.example:11434 · qwen')).toBeInTheDocument()
    expect(within(list).getByText('API key')).toBeInTheDocument()
    expect(screen.getByText(/Skipped 2 of a kind/)).toBeInTheDocument()
    expect(screen.getByText(/also holds 1 for Settings → Speech/)).toBeInTheDocument()

    fireEvent.click(checkbox('Groq'))
    fireEvent.click(screen.getByRole('button', { name: 'Add (1)' }))
    expect(onConfirm).toHaveBeenCalledWith([1])
  })

  it('offers no Add button when the file has nothing for this page', () => {
    render(
      <PresetShareImportDialog
        service="speech"
        preview={{ ...PREVIEW, entries: [], skippedUnknown: 0 }}
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('This file has no presets for this page.')).toBeInTheDocument()
    expect(screen.getByText(/for Settings → AI/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
  })
})

describe('import flow', () => {
  const imported: AiPreset = {
    id: 'new-id',
    name: 'Office PC',
    base_url: 'http://office-pc.example:11434/v1',
    model: 'qwen',
    extra_request_fields: {},
    builtin: false,
    verified_at: null,
  }

  it('adds the imported presets to the edited and the saved config without selecting them', async () => {
    const start = useAppStore.getState().config
    useAppStore.getState().setConfig(start)
    useAppStore.getState().setSavedConfig(start)
    const result: ImportResult = { speech: [], ai: [imported], keysFailed: 0 }
    invokeMock.mockImplementation(async (command) => {
      if (command === 'pick_preset_import') return PREVIEW
      if (command === 'apply_preset_import') return result
      return null
    })

    render(<PresetShareButtons service="ai" />)
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }))
    await screen.findByRole('dialog', { name: 'Import presets' })
    fireEvent.click(screen.getByRole('button', { name: 'Add (2)' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(invokeMock).toHaveBeenCalledWith('apply_preset_import', {
      service: 'ai',
      indices: [0, 1],
    })
    const state = useAppStore.getState()
    expect(state.config.ai_presets[state.config.ai_presets.length - 1]).toEqual(imported)
    const saved = state.savedConfig?.ai_presets ?? []
    expect(saved[saved.length - 1]).toEqual(imported)
    expect(state.config.active_ai_preset_id).toBe(start.active_ai_preset_id)
    expect(screen.getByRole('status')).toHaveTextContent('Added 1.')
  })

  it('shows why a file was rejected', async () => {
    invokeMock.mockRejectedValue({ code: 'newer_version', version: 2 })
    render(<PresetShareButtons service="speech" />)
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }))
    expect(await screen.findByRole('status')).toHaveTextContent('newer version of Typelite')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('helpers', () => {
  it('appends imported presets and keeps the rest', () => {
    const config = useAppStore.getState().config
    const next = withImportedPresets(config, {
      speech: [],
      ai: [{ ...config.ai_presets[0], id: 'x' }],
      keysFailed: 0,
    })
    expect(next.ai_presets).toHaveLength(config.ai_presets.length + 1)
    expect(next.speech_presets).toEqual(config.speech_presets)
    expect(next.active_ai_preset_id).toBe(config.active_ai_preset_id)
  })

  it('translates error codes and falls back for unknown ones', () => {
    expect(
      shareErrorMessage(translate, { code: 'bad_address', name: 'X', address: 'ftp://x' }),
    ).toBe('The preset “X” has an address that cannot be used: ftp://x. Nothing was imported.')
    expect(shareErrorMessage(translate, { code: 'invalid_entry', index: 0 })).toBe(
      'Preset 1 in this file is damaged.',
    )
    expect(shareErrorMessage(translate, 'boom')).toBe('Something went wrong: boom')
  })
})

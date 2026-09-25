import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SttSetupStep } from '../SttSetupStep'
import * as tauri from '../../../lib/tauri'
import { BUILTIN_SPEECH_PRESETS, useAppStore, type SpeechPreset } from '../../../stores/appStore'
import { IDLE_SETUP_STATUS, useSpeechSetupStore } from '../../../stores/speechSetupStore'
import { hardwareCheck, installedBuiltin, serverPreset } from '../../../test-utils/speechHardware'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const GUIDE = 'https://github.com/sennett-lau/typelite/blob/main/docs/guides/speech-services.md'

function config() {
  return useAppStore.getState().config
}

function activePreset() {
  return config().speech_presets.find((preset) => preset.id === config().active_speech_preset_id)
}

function setPresets(speech_presets: SpeechPreset[], active = 'builtin-speech-this-mac') {
  const next = { ...config(), speech_presets, active_speech_preset_id: active }
  useAppStore.getState().setConfig(next)
  useAppStore.getState().setSavedConfig(next)
}

function setStatus(status: Partial<tauri.SpeechSetupStatus>) {
  act(() => {
    useSpeechSetupStore.getState().applyStatus({ ...IDLE_SETUP_STATUS, ...status })
  })
}

function card() {
  return screen.getByTestId('builtin-setup-card')
}

/** The buttons in the card: only one action at a time (plan 0015). */
function cardButtons() {
  return within(card())
    .getAllByRole('button')
    .filter((button) => button.getAttribute('role') !== 'radio')
    .map((button) => button.textContent)
}

async function renderStep(onSkip = vi.fn()) {
  render(<SttSetupStep onSkip={onSkip} />)
  await waitFor(() => expect(useSpeechSetupStore.getState().hardware).not.toBeNull())
  return onSkip
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  useSpeechSetupStore.setState({ status: IDLE_SETUP_STATUS, models: null, hardware: null })
  setPresets(BUILTIN_SPEECH_PRESETS.map((preset) => ({ ...preset })))
  vi.clearAllMocks()
  vi.mocked(tauri.readCredential).mockResolvedValue(null)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
  vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue(IDLE_SETUP_STATUS)
  vi.mocked(tauri.listSpeechModels).mockResolvedValue([])
  vi.mocked(tauri.getSpeechHardware).mockResolvedValue(hardwareCheck(['large-v3-turbo', 'small']))
  vi.mocked(tauri.startSpeechSetup).mockResolvedValue(undefined)
  vi.mocked(tauri.cancelSpeechSetup).mockResolvedValue(true)
  vi.mocked(openUrl).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('SttSetupStep', () => {
  describe('Built-in card', () => {
    it('not set up: model cards, the hardware note and one button, Set up', async () => {
      await renderStep()

      expect(within(card()).getByText('Built-in')).toBeInTheDocument()
      expect(within(card()).getAllByText('Recommended').length).toBeGreaterThan(0)
      expect(
        within(card()).getByText(
          'Runs Whisper inside Typelite on this Mac. No other software needed.',
        ),
      ).toBeInTheDocument()
      const models = within(card()).getByRole('radiogroup', { name: 'Model' })
      expect(within(models).getByRole('radio', { name: /Best accuracy/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      expect(within(models).getByRole('radio', { name: /Faster/ })).toHaveAttribute(
        'aria-checked',
        'false',
      )
      expect(within(card()).getByText('This Mac: Apple M1 Pro, 32 GB memory.')).toBeInTheDocument()
      expect(cardButtons()).toEqual(['Set up'])
      // No checkmark and no server fields on the step itself.
      expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()

      fireEvent.click(within(models).getByRole('radio', { name: /Faster/ }))
      fireEvent.click(within(card()).getByRole('button', { name: 'Set up' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('small')
    })

    it('below the card: the server link on the left and Skip for now on the right', async () => {
      const onSkip = await renderStep()

      expect(
        screen.getByRole('button', { name: 'Use your own server or API key…' }),
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
      expect(onSkip).toHaveBeenCalledTimes(1)
    })

    it('a Mac offered one model still shows it selected', async () => {
      vi.mocked(tauri.getSpeechHardware).mockResolvedValue(
        hardwareCheck(['small'], { memoryBytes: 4 * 1024 ** 3, leftOut: 'needs_memory' }),
      )
      await renderStep()

      const radios = within(within(card()).getByRole('radiogroup')).getAllByRole('radio')
      expect(radios).toHaveLength(1)
      expect(radios[0]).toHaveTextContent('Faster')
      expect(radios[0]).toHaveAttribute('aria-checked', 'true')
      expect(
        within(card()).getByText(
          'This Mac: Apple M1 Pro, 4 GB memory. The larger model needs 8 GB of memory.',
        ),
      ).toBeInTheDocument()
      fireEvent.click(within(card()).getByRole('button', { name: 'Set up' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('small')
    })

    it('with no room for any model, says how much space is needed and cannot start', async () => {
      vi.mocked(tauri.getSpeechHardware).mockResolvedValue(
        hardwareCheck([], { freeBytes: 100_000_000, neededBytes: 209_094_035 }),
      )
      await renderStep()

      expect(
        within(card()).getByText('Not enough free space for a model: 0.2 GB needed, 0.1 GB free.'),
      ).toBeInTheDocument()
      expect(within(card()).getByRole('button', { name: 'Set up' })).toBeDisabled()
    })

    it('downloading: a neutral badge, size, bar, speed and time left, and Cancel', async () => {
      await renderStep()
      setStatus({
        modelId: 'large-v3-turbo',
        phase: 'downloading',
        downloadedBytes: 241_000_000,
        totalBytes: 574_041_195,
        bytesPerSecond: 12_000_000,
      })

      expect(within(card()).getByText('Downloading 41%')).toHaveClass('badge', 'badge-neutral')
      expect(within(card()).getByText('Best accuracy · 241 of 574 MB')).toBeInTheDocument()
      expect(within(card()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '41')
      expect(within(card()).getByText('12 MB/s · about 28 s left')).toBeInTheDocument()
      expect(cardButtons()).toEqual(['Cancel'])
      fireEvent.click(within(card()).getByRole('button', { name: 'Cancel' }))
      expect(tauri.cancelSpeechSetup).toHaveBeenCalledTimes(1)

      setStatus({
        modelId: 'large-v3-turbo',
        phase: 'verifying',
        totalBytes: 1,
        downloadedBytes: 1,
      })
      expect(within(card()).getByText('Checking the file')).toBeInTheDocument()
      expect(within(card()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })

    it('a cancelled download goes back to the model choice', async () => {
      await renderStep()
      setStatus({ modelId: 'small', phase: 'error', error: { code: 'cancelled' } })

      expect(cardButtons()).toEqual(['Set up'])
      expect(within(card()).getByRole('radiogroup', { name: 'Model' })).toBeInTheDocument()
    })

    it('failed: a red badge, "Nothing was installed", the reason and Try again', async () => {
      await renderStep()
      setStatus({
        modelId: 'large-v3-turbo',
        phase: 'error',
        error: { code: 'network', reason: 'connection reset' },
      })

      expect(within(card()).getByText('Download failed')).toHaveClass('badge', 'badge-error')
      expect(within(card()).getByText('Nothing was installed')).toBeInTheDocument()
      expect(
        within(card()).getByText(
          'Could not download the model: connection reset. Check your connection and try again.',
        ),
      ).toBeInTheDocument()
      expect(cardButtons()).toEqual(['Try again'])
      fireEvent.click(within(card()).getByRole('button', { name: 'Try again' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('large-v3-turbo')
    })

    it('ready: a Ready badge with the model and test time, Change model, and Next can go', async () => {
      await renderStep()
      act(() => {
        useAppStore
          .getState()
          .applyPersistedConfigPatch({ speech_presets: [installedBuiltin('large-v3-turbo', 42)] })
      })
      setStatus({ modelId: 'large-v3-turbo', phase: 'ready', testMs: 1900 })

      expect(within(card()).getByText('Ready')).toHaveClass('badge')
      expect(within(card()).getByText('Best accuracy')).toBeInTheDocument()
      expect(
        within(card()).getByText('Whisper large-v3-turbo · 574 MB · tested on this Mac in 1.9 s'),
      ).toBeInTheDocument()
      expect(cardButtons()).toEqual(['Change model'])
      expect(activePreset()?.verified_at).toBe(42)

      fireEvent.click(within(card()).getByRole('button', { name: 'Change model' }))
      expect(cardButtons()).toEqual(['Set up'])
      expect(within(card()).getByRole('radio', { name: /Best accuracy/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    it('picks up a download that is already running when the step opens', async () => {
      vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue({
        ...IDLE_SETUP_STATUS,
        modelId: 'large-v3-turbo',
        phase: 'downloading',
        downloadedBytes: 1_000_000,
        totalBytes: 574_041_195,
      })
      render(<SttSetupStep onSkip={vi.fn()} />)

      expect(await screen.findByRole('progressbar')).toBeInTheDocument()
    })
  })

  describe('Your own server or API key (sheet)', () => {
    it('with no saved presets opens straight on the form', async () => {
      await renderStep()
      fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))

      const sheet = screen.getByRole('dialog', { name: 'Add your server or API key' })
      expect(within(sheet).getByLabelText('Address')).toHaveAttribute(
        'placeholder',
        'https://api.openai.com/v1',
      )
      expect(within(sheet).getByLabelText('Model')).toHaveAttribute('placeholder', 'whisper-1')
      expect(within(sheet).getByLabelText('API key')).toHaveAttribute('placeholder', 'Optional')
      expect(within(sheet).getByLabelText('Name')).toHaveAttribute(
        'placeholder',
        'Filled in for you',
      )
      expect(within(sheet).queryByRole('button', { name: '← Saved presets' })).toBeNull()

      fireEvent.click(within(sheet).getByRole('button', { name: 'Learn more' }))
      expect(openUrl).toHaveBeenCalledWith(GUIDE)

      fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('fills Name with the host until the user types one', async () => {
      await renderStep()
      fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))
      const sheet = screen.getByRole('dialog')
      const address = within(sheet).getByLabelText('Address')
      const name = within(sheet).getByLabelText('Name')

      fireEvent.change(address, { target: { value: 'https://api.groq.com/openai/v1' } })
      expect(name).toHaveValue('api.groq.com')
      fireEvent.change(address, { target: { value: 'http://192.0.2.10:8000/v1' } })
      expect(name).toHaveValue('192.0.2.10')

      fireEvent.change(name, { target: { value: 'My PC' } })
      fireEvent.change(address, { target: { value: 'http://192.0.2.11:8000/v1' } })
      expect(name).toHaveValue('My PC')
    })

    it('tests on the same line, then "Save and use" saves the preset ready and in use', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(1400)
      await renderStep()
      fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))
      const sheet = screen.getByRole('dialog')

      const save = within(sheet).getByRole('button', { name: 'Save and use' })
      expect(save).toBeDisabled()
      fireEvent.change(within(sheet).getByLabelText('Address'), {
        target: { value: 'https://api.openai.com/v1' },
      })
      fireEvent.change(within(sheet).getByLabelText('Model'), { target: { value: 'whisper-1' } })
      fireEvent.change(within(sheet).getByLabelText('API key'), { target: { value: 'sk-test' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Test' }))
      expect(await within(sheet).findByText('Works · 1.4 s')).toBeInTheDocument()

      fireEvent.click(save)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const active = activePreset()!
      expect(active).toMatchObject({
        name: 'api.openai.com',
        base_url: 'https://api.openai.com/v1',
        model: 'whisper-1',
        kind: 'openai_compatible',
        builtin: false,
      })
      expect(active.verified_at).toEqual(expect.any(Number))
      expect(tauri.setCredential).toHaveBeenCalledWith('stt', active.id, 'sk-test')
      expect(tauri.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ active_speech_preset_id: active.id }),
      )
      expect(screen.getByTestId('speech-using-server')).toHaveTextContent('Using “api.openai.com”.')
    })

    it('a failing test shows why and saving keeps the preset not ready', async () => {
      vi.mocked(tauri.testSpeechPreset).mockRejectedValue('HTTP 401 Unauthorized')
      await renderStep()
      fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))
      const sheet = screen.getByRole('dialog')
      fireEvent.change(within(sheet).getByLabelText('Address'), {
        target: { value: 'https://api.openai.com/v1' },
      })
      fireEvent.change(within(sheet).getByLabelText('Model'), { target: { value: 'whisper-1' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Test' }))
      expect(await within(sheet).findByText('HTTP 401 Unauthorized')).toBeInTheDocument()

      fireEvent.click(within(sheet).getByRole('button', { name: 'Save and use' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(activePreset()?.verified_at).toBeNull()
    })

    describe('with two saved presets', () => {
      const pc = serverPreset('pc', 'Speech server on my PC', 'http://192.0.2.10:8000/v1')
      const groq = serverPreset('groq', 'Groq', 'https://api.groq.com/openai/v1')

      beforeEach(() => {
        setPresets([...BUILTIN_SPEECH_PRESETS.map((p) => ({ ...p })), pc, groq])
      })

      it('lists them first with name and host', async () => {
        await renderStep()
        fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))

        const sheet = screen.getByRole('dialog', { name: 'Your own server or API key' })
        const list = within(sheet).getByRole('group', { name: 'Saved presets' })
        const rows = within(list).getAllByRole('button')
        expect(rows.map((row) => row.textContent)).toEqual([
          'Speech server on my PC192.0.2.10:8000',
          'Groqapi.groq.com',
        ])
        expect(rows[0]).toHaveAttribute('aria-pressed', 'true')
        expect(within(sheet).getByRole('button', { name: 'Test and use' })).toBeInTheDocument()
        expect(within(sheet).queryByLabelText('Address')).not.toBeInTheDocument()
      })

      it('"Test and use" tests the chosen preset and makes it the one in use', async () => {
        vi.mocked(tauri.testSpeechPreset).mockResolvedValue(600)
        await renderStep()
        fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))
        const sheet = screen.getByRole('dialog')

        fireEvent.click(within(sheet).getByRole('button', { name: /Groq/ }))
        fireEvent.click(within(sheet).getByRole('button', { name: 'Test and use' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(tauri.testSpeechPreset).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'groq' }),
          '',
        )
        expect(config().active_speech_preset_id).toBe('groq')
        expect(activePreset()?.verified_at).toEqual(expect.any(Number))
      })

      it('"+ Add preset" opens the form with a way back to the list', async () => {
        await renderStep()
        fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))
        fireEvent.click(screen.getByRole('button', { name: '+ Add preset' }))

        const sheet = screen.getByRole('dialog', { name: 'Add preset' })
        expect(within(sheet).getByLabelText('Address')).toHaveValue('')
        fireEvent.click(within(sheet).getByRole('button', { name: '← Saved presets' }))
        expect(
          screen.getByRole('dialog', { name: 'Your own server or API key' }),
        ).toBeInTheDocument()
      })
    })
  })
})

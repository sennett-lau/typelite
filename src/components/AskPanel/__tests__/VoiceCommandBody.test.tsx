import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { AskAnswerPanel, type AskPanelContent } from '../AskAnswerPanel'
import { cancelVoiceCommand, confirmVoiceCommand } from '../../../lib/tauri'
import type { VoiceCommandOutcome } from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  copyAskText: vi.fn(),
  insertAskText: vi.fn(),
  openAskSource: vi.fn(() => Promise.resolve()),
  openSettingsPane: vi.fn(() => Promise.resolve()),
  confirmVoiceCommand: vi.fn(() => Promise.resolve()),
  cancelVoiceCommand: vi.fn(() => Promise.resolve()),
}))

function content(outcome: Partial<VoiceCommandOutcome>): AskPanelContent {
  return {
    kind: 'result',
    result: {
      question: 'quit zoom',
      answer: '',
      intent: 'command',
      output: 'voiceCommand',
      usedSelectedText: false,
      selectedTextTruncated: false,
      searchProvider: null,
      requestedPlacement: 'popup_answer',
      actualPlacement: null,
      fallbackReason: null,
      mayBeOutOfDate: false,
      voiceCommand: {
        action: 'quit_app',
        status: 'needsConfirm',
        target: 'Zoom',
        candidates: [],
        confirmToken: 'token-1',
        ...outcome,
      },
    },
  }
}

function renderPanel(panel: AskPanelContent) {
  render(<AskAnswerPanel content={panel} onClose={vi.fn()} onAnswerAnyway={vi.fn()} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Voice command panel (plan voice-commands)', () => {
  it('asks before quitting and confirms with the token', async () => {
    renderPanel(content({}))
    expect(screen.getByTestId('ask-voice-command')).toHaveTextContent('Quit Zoom?')
    // The spoken words are not shown.
    expect(screen.queryByText('quit zoom')).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Quit Zoom' }))
    })
    expect(confirmVoiceCommand).toHaveBeenCalledWith('token-1')
    expect(cancelVoiceCommand).not.toHaveBeenCalled()
  })

  it('cancels without quitting', async () => {
    renderPanel(content({}))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(cancelVoiceCommand).toHaveBeenCalledTimes(1)
    expect(confirmVoiceCommand).not.toHaveBeenCalled()
  })

  it('says when quitting did not work', async () => {
    vi.mocked(confirmVoiceCommand).mockRejectedValueOnce('The app did not quit.')
    renderPanel(content({}))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Quit Zoom' }))
    })
    expect(screen.getByRole('status')).toHaveTextContent('macOS did not carry out the command.')
  })

  it.each([
    [{ action: 'open_app', status: 'noMatch', target: 'Fotoshop' }, 'No app called “Fotoshop”.'],
    [
      {
        action: 'open_app',
        status: 'ambiguous',
        target: 'Microsoft',
        candidates: ['Word', 'Excel'],
      },
      'Several apps match “Microsoft”: Word, Excel.',
    ],
    [{ action: 'hide_app', status: 'notRunning', target: 'Slack' }, 'Slack is not running.'],
    [{ action: 'run_shortcut', status: 'noMatch', target: 'Tea' }, 'No Shortcut called “Tea”.'],
  ] as const)('shows a short message without buttons: %j', (outcome, message) => {
    renderPanel(
      content({
        ...outcome,
        confirmToken: null,
        candidates: [...((outcome as { candidates?: string[] }).candidates ?? [])],
      }),
    )
    expect(screen.getByTestId('ask-voice-command')).toHaveTextContent(message)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })
})

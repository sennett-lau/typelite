import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { VoiceCommandsRow } from '../VoiceCommandsRow'
import { useAppStore } from '../../../stores/appStore'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

it('is off by default in a new config (plan voice-commands)', () => {
  expect(useAppStore.getInitialState().config.voice_commands_enabled).toBe(false)
})

it('shows the switch with its explanation and reports changes', () => {
  const onChange = vi.fn()
  render(<VoiceCommandsRow enabled={false} onChange={onChange} />)
  const toggle = screen.getByRole('switch', { name: 'Voice commands' })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByText(/open Safari/)).toBeInTheDocument()
  fireEvent.click(toggle)
  expect(onChange).toHaveBeenCalledWith(true)
})

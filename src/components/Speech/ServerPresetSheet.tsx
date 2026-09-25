import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { testSpeechPreset } from '../../lib/tauri'
import { recordSpeechResult } from '../../lib/connectionStatus'
import { addressHost, formatTestTime, serverPresets } from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'
import { saveSpeechChoice } from './saveSpeech'
import { LearnMoreLink } from './LearnMoreLink'
import { ServerPresetForm } from './ServerPresetForm'

type UseResult =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; ms: number }
  | { status: 'error'; message: string }

/**
 * Plan 0015: "Your own server or API key", the sheet the onboarding step opens. With saved
 * presets it lists them (name + host) with "+ Add preset", Cancel and "Test and use"; with none
 * it opens straight on the form.
 */
export function ServerPresetSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const saved = serverPresets(config.speech_presets)
  const [view, setView] = useState<'list' | 'form'>(() => (saved.length > 0 ? 'list' : 'form'))
  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      saved.find((preset) => preset.id === config.active_speech_preset_id)?.id ??
      saved[0]?.id ??
      null,
  )
  const [result, setResult] = useState<UseResult>({ status: 'idle' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const hasSaved = saved.length > 0
  const selected = saved.find((preset) => preset.id === selectedId) ?? saved[0]
  const title =
    view === 'list'
      ? t('speech.sheetTitle')
      : hasSaved
        ? t('speech.addPresetTitle')
        : t('speech.addTitle')

  const handleTestAndUse = async () => {
    if (!selected) return
    setResult({ status: 'testing' })
    try {
      const ms = await testSpeechPreset(selected, '')
      recordSpeechResult(true)
      setResult({ status: 'ok', ms })
      const { savedConfig } = useAppStore.getState()
      const presets = (savedConfig ?? config).speech_presets
      await saveSpeechChoice({
        speech_presets: presets.map((preset) =>
          preset.id === selected.id ? { ...preset, verified_at: Date.now() } : preset,
        ),
        active_speech_preset_id: selected.id,
      })
      onClose()
    } catch (error) {
      recordSpeechResult(false)
      setResult({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : t('settings.connectionFailed'),
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-5 pt-14 pb-5">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog relative z-10 flex max-h-[85vh] w-full max-w-[460px] flex-col gap-3.5 overflow-y-auto px-5 pt-[18px] pb-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="m-0 text-[15px] font-bold text-text-primary">{title}</h3>
          <LearnMoreLink />
        </div>

        {view === 'list' ? (
          <div>
            <div className="saved-list" role="group" aria-label={t('speech.savedPresets')}>
              {saved.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={preset.id === selected?.id}
                  onClick={() => {
                    setSelectedId(preset.id)
                    setResult({ status: 'idle' })
                  }}
                >
                  <span>{preset.name}</span>
                  <span>{addressHost(preset.base_url)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => setView('form')} className="link-button">
                {t('speech.addPreset')}
              </button>
              <span className="flex-1" />
              {result.status === 'testing' && (
                <span className="text-[12px] text-text-secondary">{t('speech.testing')}</span>
              )}
              {result.status === 'ok' && (
                <span className="text-[12px] text-success">
                  {t('speech.works', { time: formatTestTime(result.ms) })}
                </span>
              )}
              {result.status === 'error' && (
                <span className="min-w-0 break-words text-[12px] text-error">{result.message}</span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
              >
                {t('speech.cancel')}
              </button>
              <button
                type="button"
                onClick={handleTestAndUse}
                disabled={!selected || result.status === 'testing'}
                className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
              >
                {result.status === 'testing' && <Loader2 size={12} className="animate-spin" />}
                {t('speech.testAndUse')}
              </button>
            </div>
          </div>
        ) : (
          <ServerPresetForm
            preset={null}
            saveLabel={t('speech.saveAndUse')}
            onSaved={onClose}
            secondary={
              hasSaved ? (
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="link-button link-button-muted"
                >
                  {t('speech.backToSaved')}
                </button>
              ) : (
                <button type="button" onClick={onClose} className="link-button link-button-muted">
                  {t('speech.cancel')}
                </button>
              )
            }
          />
        )}
      </div>
    </div>
  )
}

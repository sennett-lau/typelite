import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type { TranslationConfig } from '../../stores/appStore'
import { MAX_TRANSLATION_TARGETS, TARGET_LANGUAGES, targetLanguageLabel } from '../../lib/constants'
import { KeyText } from './KeyCaps'
import { KEY_TOKENS } from './keyTokens'
import { persistConfig } from './persistConfig'
import { bindingKeys, translationWithTarget, translationWithoutTarget } from './shortcutConfig'
import { TranslatePillPreview } from './TranslatePillPreview'

/**
 * Plan `tutorial-one-page`: the Translate setup page's languages. Three slots in one row (the
 * first empty one is "+ Add"), then a preview of the recording pill and a caption that explains
 * it. Every change is saved at once, like the shortcut.
 */
export function TranslateLanguages({ onError }: { onError: (error: string | null) => void }) {
  const { t } = useTranslation()
  const translation = useAppStore((s) => s.config.translation)
  const switchBinding = useAppStore((s) => s.config.hotkeys.switchLanguage ?? null)
  const updateConfig = useAppStore((s) => s.updateConfig)
  // The preview's own language; clicking its name cycles it, like the real pill.
  const [previewActive, setPreviewActive] = useState<string | null>(null)

  const targets = translation.targets
  const names = targets.map((code) => targetLanguageLabel(code, t))
  const activeCode =
    previewActive && targets.includes(previewActive) ? previewActive : translation.active_target
  const activeIndex = Math.max(0, targets.indexOf(activeCode))

  const save = async (next: TranslationConfig) => {
    updateConfig({ translation: next })
    onError(null)
    try {
      await persistConfig()
    } catch (error) {
      onError(String(error))
    }
  }

  const available = TARGET_LANGUAGES.filter((language) => !targets.includes(language.value))

  return (
    <div className="tutorial-card flex flex-col gap-2.5 px-3.5 py-3">
      <div className="flex items-baseline justify-between text-[13px] text-text-primary">
        <span id="translate-into-label">{t('onboarding.translate.languagesLabel')}</span>
        <small className="text-[11.5px] text-text-tertiary">
          {t('onboarding.translate.count', { count: targets.length, max: MAX_TRANSLATION_TARGETS })}
        </small>
      </div>

      <div className="lang-slots" role="list" aria-labelledby="translate-into-label">
        {Array.from({ length: MAX_TRANSLATION_TARGETS }).map((_, index) => {
          const code = targets[index]
          if (code) {
            const name = names[index]
            return (
              <div key={code} role="listitem" className="lang-slot" title={name}>
                {targets.length > 1 && <span className="lang-slot-number">{index + 1}</span>}
                <span className="lang-slot-name">{name}</span>
                <button
                  type="button"
                  className="lang-slot-remove"
                  aria-label={t('onboarding.translate.remove', { language: name })}
                  onClick={() => void save(translationWithoutTarget(translation, code))}
                >
                  <X size={11} />
                </button>
              </div>
            )
          }
          if (index === targets.length) {
            return (
              <div key="add" role="listitem" className="min-w-0">
                <select
                  className="lang-slot lang-slot-add"
                  aria-label={t('onboarding.translate.addLabel')}
                  value=""
                  onChange={(event) =>
                    void save(translationWithTarget(translation, event.target.value))
                  }
                >
                  <option value="" disabled>
                    {t('onboarding.translate.add')}
                  </option>
                  {available.map((language) => (
                    <option key={language.value} value={language.value}>
                      {targetLanguageLabel(language.value, t)}
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          return <div key={`empty-${index}`} className="lang-slot lang-slot-empty" aria-hidden />
        })}
      </div>

      <div className="flex flex-col items-center gap-2 pt-1">
        <div className="pill-preview-stage">
          <TranslatePillPreview
            names={names}
            active={activeIndex}
            onSwitch={() => setPreviewActive(targets[(activeIndex + 1) % targets.length])}
          />
        </div>
        <p className="m-0 text-center text-[12px] leading-[1.8] text-text-secondary">
          <PreviewCaption
            count={targets.length}
            switchKey={switchBinding ? bindingKeys(switchBinding) : null}
          />
        </p>
      </div>
    </div>
  )
}

function PreviewCaption({ count, switchKey }: { count: number; switchKey: string[] | null }) {
  const { t } = useTranslation()
  if (count === 0) return <>{t('onboarding.translate.captionNone')}</>
  if (count === 1) return <>{t('onboarding.translate.captionOne')}</>
  if (!switchKey) return <>{t('onboarding.translate.captionSwitchOff')}</>
  return (
    <KeyText text={t('onboarding.translate.captionSwitch', KEY_TOKENS)} keys={{ key: switchKey }} />
  )
}

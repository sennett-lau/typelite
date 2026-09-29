import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'

/** Plan `elevenlabs-speech`: where to get a key, the docs and the pricing. */
const ELEVENLABS_LINKS = {
  apiKeys: 'https://elevenlabs.io/app/settings/api-keys',
  docs: 'https://elevenlabs.io/docs/overview/capabilities/speech-to-text',
  pricing: 'https://elevenlabs.io/pricing/api',
} as const

const LINKS: { key: keyof typeof ELEVENLABS_LINKS; label: string }[] = [
  { key: 'apiKeys', label: 'speech.elevenLabsTip.getKey' },
  { key: 'docs', label: 'speech.elevenLabsTip.docs' },
  { key: 'pricing', label: 'speech.elevenLabsTip.pricing' },
]

/**
 * Shown under the fields of the server form for an ElevenLabs address, in Settings and in
 * onboarding (they share the form): what happens to the audio, the key permission, and links
 * that open in the browser.
 */
export function ElevenLabsTip() {
  const { t } = useTranslation()
  return (
    <div className="mt-2 text-[12px] text-text-secondary" data-testid="elevenlabs-tip">
      <p className="m-0">{t('speech.elevenLabsTip.text')}</p>
      <p className="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {LINKS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="link-button"
            onClick={() =>
              openUrl(ELEVENLABS_LINKS[key]).catch((error) =>
                console.error('[speech] failed to open an ElevenLabs link', error),
              )
            }
          >
            {t(label)}
          </button>
        ))}
      </p>
    </div>
  )
}

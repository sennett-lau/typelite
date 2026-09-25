import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Copy, ExternalLink } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Row } from '../ui/Group'

/** The full AI polish guide in the repository, opened by "Open full guide". */
const FULL_GUIDE_URL = 'https://github.com/sennett-lau/typelite/blob/main/docs/guides/ai-polish.md'

/** Commands for "this Mac", shown with copy buttons. They are not translated. */
const LOCAL_COMMANDS = [
  'brew install ollama',
  'ollama pull qwen3:4b-instruct-2507-q4_K_M',
  'ollama serve',
]

/** One command in monospace with a copy button. */
function CommandLine({ command }: { command: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard
      ?.writeText(command)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch((error) => console.error('[guide] copy failed', error))
  }

  return (
    <div className="mt-1.5 flex items-start gap-2 rounded-[8px] bg-bg-secondary px-2.5 py-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] leading-relaxed text-text-primary">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="btn-icon flex-none"
        aria-label={copied ? t('onboarding.guide.copied') : t('onboarding.guide.copy')}
        title={copied ? t('onboarding.guide.copied') : t('onboarding.guide.copy')}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

/** The AI polish guide card: three ways to get the service, short steps, and the full guide. */
function SetupGuideCard() {
  const { t } = useTranslation()
  const prefix = 'onboarding.guide.ai'

  return (
    <div className="row-group" data-testid="setup-guide-ai">
      <Row label={t('onboarding.guide.thisMac')} help={t(`${prefix}.thisMac`)} layout="stacked">
        {LOCAL_COMMANDS.map((command) => (
          <CommandLine key={command} command={command} />
        ))}
        <p className="row-help mt-1.5">{t(`${prefix}.thisMacThen`)}</p>
      </Row>
      <Row label={t('onboarding.guide.otherComputer')} help={t(`${prefix}.otherComputer`)} />
      <Row label={t('onboarding.guide.cloud')} help={t(`${prefix}.cloud`)} />
      <Row>
        <button
          type="button"
          onClick={() =>
            openUrl(FULL_GUIDE_URL).catch((error) =>
              console.error('[guide] failed to open the full guide', error),
            )
          }
          className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
        >
          <ExternalLink size={12} />
          {t('onboarding.guide.openFullGuide')}
        </button>
      </Row>
    </div>
  )
}

/**
 * "How to set this up" for the AI polish service: expands the guide card below the link.
 * (Speech has no in-app guide since plan `two-tab-speech`; its "Learn more" opens the guide on
 * GitHub.)
 */
export function SetupGuide() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
      >
        {t('onboarding.guide.howTo')}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <SetupGuideCard />}
    </div>
  )
}

/** "Skip for now", in the same quiet style as on the welcome step. */
export function SkipLink({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="text-center">
      <button
        type="button"
        onClick={onSkip}
        className="border-none bg-transparent text-[12px] text-text-tertiary underline-offset-2 hover:text-text-primary hover:underline cursor-pointer"
      >
        {t('onboarding.welcome.skipForNow')}
      </button>
    </div>
  )
}

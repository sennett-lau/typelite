import { useTranslation } from 'react-i18next'

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

import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StepIndicator } from './StepIndicator'

interface Props {
  step: number
  totalSteps: number
  title: string
  subtitle?: string
  canNext: boolean
  canBack: boolean
  nextLabel?: string
  onNext: () => void
  onBack: () => void
  /** Replaces the default close action (quit the app), for example to return to Home. */
  onClose?: () => void
  /** Centre the step content vertically in the step area (the welcome step). */
  centerContent?: boolean
  /** A wider step area (the speech step's Built-in card, plan 0015). */
  wideContent?: boolean
  children: React.ReactNode
}

export function OnboardingLayout({
  step,
  totalSteps,
  title,
  subtitle,
  canNext,
  canBack,
  nextLabel,
  onNext,
  onBack,
  onClose,
  centerContent = false,
  wideContent = false,
  children,
}: Props) {
  const { t } = useTranslation()
  const quit = () => {
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('plugin:process|exit', { code: 0 }))
      .catch(() => {})
  }
  const handleClose = onClose ?? quit

  return (
    <div className="app-window flex h-full w-full flex-col">
      {/* No title bar (plan 0005): this strip drags the window. */}
      <div className="drag-strip" data-tauri-drag-region aria-hidden="true" />

      <div className="content-surface flex min-h-0 flex-1 flex-col border-l-0">
        {/* Close button, above the drag strip so it stays clickable. */}
        <div className="relative z-50 flex h-9 flex-none items-center justify-end px-3">
          <button
            type="button"
            onClick={handleClose}
            className="btn-icon"
            aria-label={t('onboarding.layout.close')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-none justify-center">
          <StepIndicator total={totalSteps} current={step} />
        </div>

        <div className="flex-none px-8 pt-3 pb-5 text-center">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto px-8 ${centerContent ? 'flex flex-col' : ''}`}
          data-testid="onboarding-step-area"
        >
          {/* my-auto centres the content when it is shorter than the area and still lets it
              scroll from the top when it is taller. */}
          <div
            className={`mx-auto w-full ${wideContent ? 'max-w-[480px]' : 'max-w-[400px]'} pb-6 ${centerContent ? 'my-auto' : ''}`}
            data-centered={centerContent ? 'true' : undefined}
          >
            {children}
          </div>
        </div>

        <div className="flex flex-none items-center justify-between px-8 py-4">
          <button
            type="button"
            onClick={onBack}
            disabled={!canBack}
            className={`btn-secondary px-4 py-1.5 text-[13px] ${canBack ? '' : 'invisible'}`}
          >
            {t('onboarding.layout.back')}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            className="btn-accent px-5 py-1.5 text-[13px] font-medium"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

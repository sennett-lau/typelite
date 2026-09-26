import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnboardingLayout } from '../OnboardingLayout'

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

afterEach(() => cleanup())

function renderLayout(wideContent = false) {
  return render(
    <OnboardingLayout
      step={1}
      totalSteps={4}
      title="Voice input"
      subtitle="Choose your microphone"
      canNext
      canBack
      nextLabel="Next"
      onNext={vi.fn()}
      onBack={vi.fn()}
      wideContent={wideContent}
    >
      <p>Step content</p>
    </OnboardingLayout>,
  )
}

describe('OnboardingLayout (plan tutorial-one-page)', () => {
  it('puts the title and the content in one block centred in a scrolling area', () => {
    renderLayout()
    const area = screen.getByTestId('onboarding-step-area')
    const block = screen.getByTestId('onboarding-block')

    expect(area).toHaveClass('overflow-y-auto', 'flex', 'flex-col', 'flex-1', 'min-h-0')
    // my-auto centres a short block and lets a tall one start at the top and scroll.
    expect(block).toHaveClass('my-auto')
    expect(area).toContainElement(block)
    expect(block).toContainElement(screen.getByRole('heading', { name: 'Voice input' }))
    expect(block).toContainElement(screen.getByText('Choose your microphone'))
    expect(block).toContainElement(screen.getByText('Step content'))
  })

  it('keeps 22 pt between the title and the content, and the usual content widths', () => {
    renderLayout()
    const heading = screen.getByRole('heading', { name: 'Voice input' })
    expect(heading.parentElement).toHaveClass('pb-[22px]', 'text-center')
    expect(screen.getByText('Step content').parentElement).toHaveClass('max-w-[400px]', 'mx-auto')
    cleanup()

    renderLayout(true)
    expect(screen.getByText('Step content').parentElement).toHaveClass('max-w-[480px]')
  })
})

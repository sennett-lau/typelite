import { useTranslation } from 'react-i18next'
import { useTranslatePill } from './translatePill'

/**
 * The language part of a Translate recording pill (plan `translate-pill-and-keys`, option B):
 * the active language's name and, with two or three languages, one small dot per language
 * (the filled dot is the active one). One language shows its name only; none shows nothing.
 */
export function TranslatePillLanguage() {
  const { t } = useTranslation()
  const pill = useTranslatePill()
  if (pill.name === null) return null

  return (
    <>
      <span
        className="pill-lang-name"
        title={pill.name}
        aria-label={t('translate.pillLanguage', { language: pill.name })}
      >
        {pill.name}
      </span>
      {pill.dots > 0 && (
        <span
          className="pill-lang-dots"
          role="img"
          aria-label={t('translate.pillPosition', {
            index: pill.activeIndex + 1,
            count: pill.dots,
          })}
          data-testid="translate-pill-dots"
        >
          {pill.codes.map((code, index) => (
            <i key={code} className={index === pill.activeIndex ? 'pill-lang-dot-on' : undefined} />
          ))}
        </span>
      )}
    </>
  )
}

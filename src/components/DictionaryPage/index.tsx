import { useTranslation } from 'react-i18next'
import { DictionaryPane } from '../Settings/DictionaryPane'
import { PageFrame } from '../PageFrame'

/** The Dictionary tab: words speech recognition should know, and fixes applied after it. */
export function DictionaryPage() {
  const { t } = useTranslation()
  return (
    <PageFrame title={t('nav.dictionary')} subtitle={t('dictionary.subtitle')}>
      <DictionaryPane />
    </PageFrame>
  )
}

import { useTranslation } from 'react-i18next'
import { Group, Row } from '../ui/Group'
import { WebSearchForm } from '../WebSearch/WebSearchForm'

/**
 * Settings → Search (plan `ask-web-search`): the search provider Ask anything uses for questions
 * that need live information. Saves by itself, not through the Save bar.
 */
export function SearchPane() {
  const { t } = useTranslation()
  return (
    <div>
      <Group label={t('webSearch.group')}>
        <Row label={t('webSearch.title')} help={t('webSearch.help')} layout="stacked">
          <WebSearchForm idPrefix="settings-web-search" />
        </Row>
      </Group>
    </div>
  )
}

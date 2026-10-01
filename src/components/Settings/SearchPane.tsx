import { useTranslation } from 'react-i18next'
import { Group, Row } from '../ui/Group'
import { WebSearchSetup } from '../WebSearch/WebSearchSetup'

/**
 * Settings → Search (plans `ask-web-search`, `searxng-setup`): the search provider Ask anything
 * uses for questions that need live information: Built-in, or your own SearXNG. Saves by itself,
 * not through the Save bar.
 */
export function SearchPane() {
  const { t } = useTranslation()
  return (
    <div>
      <Group label={t('webSearch.group')}>
        <Row label={t('webSearch.uses')} help={t('webSearch.help')} layout="stacked">
          <WebSearchSetup idPrefix="settings-web-search" />
        </Row>
      </Group>
    </div>
  )
}

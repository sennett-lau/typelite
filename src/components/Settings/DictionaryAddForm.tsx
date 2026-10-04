import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { addCorrectionRule, addDictionaryEntry } from '../../lib/tauri'
import { toast } from '../toast-service'
import { Group, Row } from '../ui/Group'

interface Props {
  activeSection: 'words' | 'corrections'
  onAdded: () => Promise<void>
}

/** Keep draft updates local so typing never rerenders the dictionary's existing rows. */
export function DictionaryAddForm({ activeSection, onAdded }: Props) {
  const { t } = useTranslation()
  // One mounted form owns both drafts; changing sections replaces only the visible controls.
  const [word, setWord] = useState('')
  const [pronunciation, setPronunciation] = useState('')
  const [pattern, setPattern] = useState('')
  const [replacement, setReplacement] = useState('')

  const handleAdd = async () => {
    if (!word.trim()) return
    try {
      await addDictionaryEntry(word.trim(), pronunciation.trim() || null)
      setWord('')
      setPronunciation('')
      await onAdded()
    } catch (error) {
      console.error('Failed to add entry:', error)
      toast.error(t('dictionary.failedToAdd'))
    }
  }

  const handleAddCorrection = async () => {
    const nextPattern = pattern.trim()
    const nextReplacement = replacement.trim()
    if (!nextPattern || !nextReplacement) return
    try {
      await addCorrectionRule(nextPattern, nextReplacement)
      setPattern('')
      setReplacement('')
      await onAdded()
    } catch (error) {
      console.error('Failed to add correction rule:', error)
      toast.error(t('dictionary.failedToAddCorrection'))
    }
  }

  if (activeSection === 'words') {
    return (
      <Group label={t('dictionary.addWord')}>
        <Row>
          <div className="flex flex-wrap gap-2">
            <input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              placeholder={t('dictionary.word')}
              className="field min-w-[120px] flex-1"
            />
            <input
              value={pronunciation}
              onChange={(event) => setPronunciation(event.target.value)}
              placeholder={t('dictionary.pronunciationOptional')}
              className="field min-w-[120px] flex-1"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!word.trim()}
              className="btn-accent"
            >
              <Plus size={12} />
              {t('dictionary.add')}
            </button>
          </div>
        </Row>
      </Group>
    )
  }

  return (
    <Group label={t('dictionary.addCorrectionTitle')}>
      <Row>
        <div className="flex flex-wrap gap-2">
          <input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder={t('dictionary.wrongPhrase')}
            className="field min-w-[120px] flex-1"
          />
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder={t('dictionary.correctPhrase')}
            className="field min-w-[120px] flex-1"
          />
          <button
            type="button"
            onClick={() => void handleAddCorrection()}
            disabled={!pattern.trim() || !replacement.trim()}
            aria-label={t('dictionary.addCorrection')}
            className="btn-accent"
          >
            <Plus size={12} />
            {t('dictionary.add')}
          </button>
        </div>
      </Row>
    </Group>
  )
}

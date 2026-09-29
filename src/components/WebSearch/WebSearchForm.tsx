import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  getWebSearchStatus,
  removeWebSearch,
  saveWebSearch,
  testWebSearch,
  type SearchProviderKind,
  type WebSearchStatus,
} from '../../lib/tauri'
import { formatTestTime } from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'

/** The web search guide on GitHub, opened by "How to run SearXNG". */
export const WEB_SEARCH_GUIDE_URL =
  'https://github.com/sennett-lau/typelite/blob/main/docs/guides/web-search.md'

/** The providers the form offers. Plan `ask-web-search`: SearXNG first; more can slot in. */
const PROVIDERS: { id: Exclude<SearchProviderKind, 'none'>; label: string }[] = [
  { id: 'searxng', label: 'SearXNG' },
]

const SEARCH_OFF = { provider: 'none', base_url: '' } as const

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; ms: number; results: number }
  | { status: 'error'; message: string }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Plan `ask-web-search`: set, test, change or remove the search provider Ask uses for live
 * questions. Used in Settings → AI polish and in onboarding's AI step. Saves on its own (not
 * through the Save bar): the address goes to the settings file, the optional key to the Keychain.
 */
export function WebSearchForm({ idPrefix = 'web-search' }: { idPrefix?: string }) {
  const { t } = useTranslation()
  const saved = useAppStore((s) => s.config.web_search) ?? SEARCH_OFF
  const applyPersistedConfigPatch = useAppStore((s) => s.applyPersistedConfigPatch)
  const [provider, setProvider] = useState<Exclude<SearchProviderKind, 'none'>>(
    saved.provider === 'none' ? 'searxng' : saved.provider,
  )
  const [address, setAddress] = useState(saved.base_url)
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  // Set once a save or removal answered, so the first status load cannot overwrite it.
  const statusFromAction = useRef(false)

  useEffect(() => {
    let cancelled = false
    // Through a promise so a missing backend (tests, older builds) only skips the status.
    Promise.resolve()
      .then(() => getWebSearchStatus())
      .then((status) => {
        if (cancelled || statusFromAction.current) return
        setHasKey(status.hasKey)
        if (status.config.provider !== 'none') {
          setProvider(status.config.provider)
          setAddress(status.config.base_url)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const configured = saved.provider !== 'none' && saved.base_url.trim() !== ''
  const complete = address.trim() !== ''
  // An empty key field keeps the stored key; typing replaces it.
  const keyArgument = apiKey.trim() === '' ? undefined : apiKey

  const applyStatus = (status: WebSearchStatus) => {
    statusFromAction.current = true
    applyPersistedConfigPatch({ web_search: status.config })
    setHasKey(status.hasKey)
    setApiKey('')
  }

  const runTest = () => {
    setTest({ status: 'testing' })
    testWebSearch(provider, address, keyArgument)
      .then(({ results, ms }) => setTest({ status: 'ok', results, ms }))
      .catch((error) => setTest({ status: 'error', message: errorText(error) }))
  }

  const save = () => {
    setBusy(true)
    setMessage(null)
    saveWebSearch(provider, address, keyArgument)
      .then((status) => {
        applyStatus(status)
        setMessage({ kind: 'ok', text: t('webSearch.saved') })
      })
      .catch((error) => setMessage({ kind: 'error', text: errorText(error) }))
      .finally(() => setBusy(false))
  }

  const removeKey = () => {
    setBusy(true)
    setMessage(null)
    saveWebSearch(provider, address, '')
      .then(applyStatus)
      .catch((error) => setMessage({ kind: 'error', text: errorText(error) }))
      .finally(() => setBusy(false))
  }

  const remove = () => {
    setBusy(true)
    setMessage(null)
    removeWebSearch()
      .then((status) => {
        applyStatus(status)
        setAddress('')
        setTest({ status: 'idle' })
        setMessage({ kind: 'ok', text: t('webSearch.removed') })
      })
      .catch((error) => setMessage({ kind: 'error', text: errorText(error) }))
      .finally(() => setBusy(false))
  }

  const fieldClass = 'field font-mono text-[12px]'
  const id = (field: string) => `${idPrefix}-${field}`

  return (
    <div data-testid="web-search-form">
      <div className="form-grid">
        <label htmlFor={id('provider')}>{t('webSearch.provider')}</label>
        <select
          id={id('provider')}
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as Exclude<SearchProviderKind, 'none'>)
            setTest({ status: 'idle' })
          }}
          className="field text-[12.5px]"
        >
          {PROVIDERS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <label htmlFor={id('address')}>{t('speech.address')}</label>
        <input
          id={id('address')}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value)
            setTest({ status: 'idle' })
          }}
          placeholder="http://127.0.0.1:8888"
          spellCheck={false}
          className={fieldClass}
        />
        <label htmlFor={id('key')}>{t('webSearch.key')}</label>
        <input
          id={id('key')}
          type="password"
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value)
            setTest({ status: 'idle' })
          }}
          placeholder={hasKey ? t('webSearch.keySaved') : t('webSearch.keyPlaceholder')}
          // The placeholder is a sentence, so it is in the text font; a typed key is not.
          className={`${fieldClass} placeholder:font-sans placeholder:text-[12.5px]`}
        />
      </div>
      <p className="m-0 mt-2 text-[12px] text-text-secondary">
        {t('webSearch.privacy')}{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => openUrl(WEB_SEARCH_GUIDE_URL).catch(() => {})}
        >
          {t('webSearch.howToRun')}
        </button>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {configured && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium text-error"
          >
            {t('webSearch.remove')}
          </button>
        )}
        {hasKey && (
          <button
            type="button"
            onClick={removeKey}
            disabled={busy}
            className="link-button link-button-muted"
          >
            {t('webSearch.removeKey')}
          </button>
        )}
        <span className="flex-1" />
        {/* The Test result and the Save message are separate lines, so one never hides the other. */}
        <span role="status" className="flex min-w-0 flex-col items-end break-words text-[12px]">
          {test.status === 'testing' && (
            <span className="text-text-secondary">{t('speech.testing')}</span>
          )}
          {test.status === 'ok' && (
            <span className="text-success">
              {t('webSearch.works', { count: test.results, time: formatTestTime(test.ms) })}
            </span>
          )}
          {test.status === 'error' && <span className="text-error">{test.message}</span>}
          {message && (
            <span className={message.kind === 'ok' ? 'text-text-secondary' : 'text-error'}>
              {message.text}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={runTest}
          disabled={!complete || test.status === 'testing'}
          className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
        >
          {test.status === 'testing' && <Loader2 size={12} className="animate-spin" />}
          {t('speech.test')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!complete || busy}
          className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
        >
          {t('webSearch.save')}
        </button>
      </div>
    </div>
  )
}

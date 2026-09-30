import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2 } from 'lucide-react'
import {
  BUILTIN_SEARCH_PROGRESS_EVENT,
  builtinSearchStatus,
  checkBuiltinSearchUpdate,
  installBuiltinSearch,
  removeBuiltinSearch,
  removeWebSearch,
  saveWebSearch,
  testWebSearch,
  updateBuiltinSearch,
  type BuiltinSearchProgress,
  type BuiltinSearchStatus,
  type BuiltinSearchStep,
  type BuiltinSearchUpdateCheck,
} from '../../lib/tauri'
import { formatTestTime } from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'
import { recordSearchTest } from '../../lib/connectionStatus'
import { WebSearchForm } from './WebSearchForm'
import { STEPS, progressShare, versionLabel } from './builtinSearch'

type Choice = 'builtin' | 'own'

const STEP_KEY: Record<BuiltinSearchStep, string> = {
  downloadingUv: 'stepDownloadingUv',
  installingPython: 'stepInstallingPython',
  downloadingSearxng: 'stepDownloadingSearxng',
  installingLibraries: 'stepInstallingLibraries',
  starting: 'stepStarting',
  done: 'stepStarting',
}

type Test =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; results: number; ms: number }
  | { status: 'error'; message: string }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function SetupSteps({ progress }: { progress: BuiltinSearchProgress | null }) {
  const { t } = useTranslation()
  const now = progress ? STEPS.indexOf(progress.step) : 0
  const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1)
  return (
    <ol className="search-setup-steps" data-testid="builtin-search-steps">
      {STEPS.map((step, index) => {
        const state = index < now ? 'done' : index === now ? 'now' : 'next'
        return (
          <li key={step} className={`is-${state}`}>
            <span className="search-setup-dot" aria-hidden="true">
              {state === 'done' && <Check size={9} />}
            </span>
            {t(`webSearch.${STEP_KEY[step]}`)}
            {state === 'now' && progress?.done != null && progress.total != null && (
              <span className="text-text-tertiary">
                {' · '}
                {t('webSearch.downloadedOf', {
                  done: mb(progress.done),
                  total: mb(progress.total),
                })}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Plan `searxng-setup`: the Built-in provider's card. Not set up → Set up (downloads SearXNG
 * with its own Python); setting up → the steps and a bar; ready → version, address, Test,
 * Check for updates and Remove; an update → Update; a failure → the reason and Try again.
 */
function BuiltinCard({ onboarding }: { onboarding: boolean }) {
  const { t } = useTranslation()
  const savedProvider = useAppStore((s) => s.config.web_search?.provider ?? 'none')
  const applyPersistedConfigPatch = useAppStore((s) => s.applyPersistedConfigPatch)
  const [status, setStatus] = useState<BuiltinSearchStatus | null>(null)
  const [progress, setProgress] = useState<BuiltinSearchProgress | null>(null)
  const [working, setWorking] = useState<'setup' | 'update' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<Test>({ status: 'idle' })
  const [check, setCheck] = useState<
    { state: 'checking' } | { state: 'done'; result: BuiltinSearchUpdateCheck } | null
  >(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(() => {
    Promise.resolve()
      .then(() => builtinSearchStatus())
      .then((next) => {
        if (mounted.current) setStatus(next)
      })
      .catch(() => {})
  }, [])

  // The status, and progress events (also from a setup started on another page).
  useEffect(() => {
    mounted.current = true
    refresh()
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<BuiltinSearchProgress>(BUILTIN_SEARCH_PROGRESS_EVENT, (event) => {
          if (mounted.current) setProgress(event.payload)
        }),
      )
      .then((stop) => {
        if (mounted.current) unlisten = stop
        else stop()
      })
      .catch(() => {})
    return () => {
      mounted.current = false
      unlisten?.()
    }
  }, [refresh])

  // A setup that another page started: follow it until it ends.
  const busyElsewhere = Boolean(status?.busy) && working === null
  useEffect(() => {
    if (!busyElsewhere) return
    const timer = setInterval(refresh, 1000)
    return () => clearInterval(timer)
  }, [busyElsewhere, refresh])

  const chooseBuiltin = useCallback(async () => {
    const saved = await saveWebSearch('builtin', '')
    applyPersistedConfigPatch({ web_search: saved.config })
  }, [applyPersistedConfigPatch])

  const setUp = () => {
    setWorking('setup')
    setError(null)
    setProgress(null)
    installBuiltinSearch()
      .then(async (next) => {
        setStatus(next)
        await chooseBuiltin()
      })
      .catch((reason) => setError(errorText(reason)))
      .finally(() => {
        setWorking(null)
        refresh()
      })
  }

  const update = () => {
    setWorking('update')
    setError(null)
    setProgress(null)
    updateBuiltinSearch()
      .then((next) => {
        setStatus(next)
        setCheck(null)
      })
      .catch((reason) => setError(errorText(reason)))
      .finally(() => {
        setWorking(null)
        refresh()
      })
  }

  const runTest = () => {
    setTest({ status: 'testing' })
    testWebSearch('builtin', '')
      .then(({ results, ms }) => {
        setTest({ status: 'ok', results, ms })
        recordSearchTest('builtin', true)
      })
      .catch((reason) => {
        setTest({ status: 'error', message: errorText(reason) })
        recordSearchTest('builtin', false)
      })
      .finally(refresh)
  }

  const checkUpdates = () => {
    setCheck({ state: 'checking' })
    checkBuiltinSearchUpdate()
      .then((result) => setCheck({ state: 'done', result }))
      .catch((reason) => {
        setCheck(null)
        setError(errorText(reason))
      })
  }

  const remove = () => {
    setConfirmRemove(false)
    setError(null)
    removeBuiltinSearch()
      .then(async (next) => {
        setStatus(next)
        setTest({ status: 'idle' })
        setCheck(null)
        if (savedProvider === 'builtin') {
          const off = await removeWebSearch()
          applyPersistedConfigPatch({ web_search: off.config })
        }
      })
      .catch((reason) => setError(errorText(reason)))
  }

  const running = working !== null || busyElsewhere
  if (running) {
    // A setup started on another page: its last step comes with the status until an event.
    const shown = progress ?? status?.progress ?? null
    return (
      <div className="search-setup-card" data-testid="builtin-search-card" data-state="working">
        <div className="flex items-center gap-2">
          <Loader2 size={13} className="animate-spin text-accent" aria-hidden="true" />
          <b className="flex-1 text-[13px]">
            {working === 'update' ? t('webSearch.updating') : t('webSearch.settingUp')}
          </b>
          <span className="text-[12px] text-text-tertiary">{t('webSearch.settingUpTime')}</span>
        </div>
        <div
          className="search-setup-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressShare(shown) * 100)}
        >
          <i style={{ width: `${Math.round(progressShare(shown) * 100)}%` }} />
        </div>
        <SetupSteps progress={shown} />
        <p className="m-0 text-[12px] text-text-secondary">
          {onboarding ? t('webSearch.settingUpGoOn') : t('webSearch.settingUpLeave')}
        </p>
      </div>
    )
  }

  const installed = status?.installed ?? null
  if (!installed) {
    return (
      <div
        className="search-setup-card"
        data-testid="builtin-search-card"
        data-state={error ? 'failed' : 'none'}
      >
        {error ? (
          <>
            <div className="flex items-center gap-2">
              <b className="flex-1 text-[13px]">{t('webSearch.failedTitle')}</b>
              <span className="search-setup-pill is-warn">{t('webSearch.failed')}</span>
            </div>
            <p className="m-0 break-words text-[12px] text-error" role="alert">
              {error}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex-1 text-[12px] text-text-secondary">
                {t('webSearch.failedKept')}
              </span>
              <button
                type="button"
                onClick={setUp}
                className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
              >
                {t('webSearch.tryAgain')}
              </button>
            </div>
          </>
        ) : (
          <>
            <b className="text-[13px]">{t('webSearch.setupTitle')}</b>
            <p className="m-0 text-[12px] leading-[1.45] text-text-secondary">
              {t('webSearch.setupBody')}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="min-w-0 flex-1 text-[11.5px] text-text-tertiary">
                {t('webSearch.setupLicence')}
              </span>
              <button
                type="button"
                onClick={setUp}
                className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
              >
                {t('webSearch.setup')}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const updateAvailable = check?.state === 'done' && check.result.updateAvailable
  return (
    <div className="search-setup-card" data-testid="builtin-search-card" data-state="ready">
      <div className="flex items-center gap-2">
        <b className="flex-1 text-[13px]">{t('webSearch.readyTitle')}</b>
        <span className={`search-setup-pill ${status?.running ? 'is-ok' : ''}`}>
          {status?.running ? `● ${t('webSearch.running')}` : t('webSearch.startsWhenNeeded')}
        </span>
      </div>
      <dl className="search-setup-facts">
        <dt>{t('webSearch.version')}</dt>
        <dd>{versionLabel(installed.commit, installed.commitDate)}</dd>
        <dt>{t('webSearch.address')}</dt>
        <dd>
          {status?.port ? `127.0.0.1:${status.port}` : '127.0.0.1'}, {t('webSearch.thisMacOnly')}
        </dd>
        {test.status !== 'idle' && (
          <>
            <dt>{t('webSearch.lastTest')}</dt>
            <dd role="status">
              {test.status === 'testing' && t('speech.testing')}
              {test.status === 'ok' && (
                <span className="text-success">
                  {t('webSearch.works', { count: test.results, time: formatTestTime(test.ms) })}
                </span>
              )}
              {test.status === 'error' && <span className="text-error">{test.message}</span>}
            </dd>
          </>
        )}
      </dl>
      {updateAvailable && check?.state === 'done' && (
        <div className="search-setup-update">
          <span className="min-w-0 flex-1">
            <b>{t('webSearch.updateAvailable')}</b>{' '}
            <span className="text-text-secondary">
              · {versionLabel(check.result.latestCommit, check.result.latestDate)}.{' '}
              {t('webSearch.updateWhy')}
            </span>
          </span>
          <button
            type="button"
            onClick={update}
            className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('webSearch.update')}
          </button>
        </div>
      )}
      {error && (
        <p className="m-0 break-words text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
      {savedProvider !== 'builtin' && (
        <div className="flex items-center gap-2.5">
          <span className="flex-1 text-[12px] text-text-secondary" />
          <button
            type="button"
            onClick={() => chooseBuiltin().catch((reason) => setError(errorText(reason)))}
            className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('webSearch.useBuiltin')}
          </button>
        </div>
      )}
      {confirmRemove ? (
        <div
          className="search-setup-update"
          role="alertdialog"
          aria-label={t('webSearch.removeBuiltin')}
        >
          <span className="min-w-0 flex-1 text-[12px]">{t('webSearch.removeConfirm')}</span>
          <button
            type="button"
            onClick={() => setConfirmRemove(false)}
            className="btn-secondary px-3 py-1.5 text-[12.5px]"
          >
            {t('webSearch.cancel')}
          </button>
          <button
            type="button"
            onClick={remove}
            className="btn-secondary px-3 py-1.5 text-[12.5px] text-error"
          >
            {t('webSearch.removeYes')}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runTest}
            disabled={test.status === 'testing'}
            className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
          >
            {test.status === 'testing' && <Loader2 size={12} className="animate-spin" />}
            {t('speech.test')}
          </button>
          {!updateAvailable && (
            <button
              type="button"
              onClick={checkUpdates}
              disabled={check?.state === 'checking'}
              className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
            >
              {check?.state === 'checking' ? t('webSearch.checking') : t('webSearch.checkUpdates')}
            </button>
          )}
          {check?.state === 'done' && !check.result.updateAvailable && (
            <span className="text-[12px] text-text-secondary" role="status">
              {t('webSearch.upToDate')}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium text-error"
          >
            {t('webSearch.removeBuiltin')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Plan `searxng-setup`: Settings → Search and the onboarding step. Two choices, as on the AI
 * tab: Built-in (Typelite sets up SearXNG here) and Your own SearXNG (an address and a key).
 */
export function WebSearchSetup({
  idPrefix = 'web-search',
  onboarding = false,
}: {
  idPrefix?: string
  onboarding?: boolean
}) {
  const { t } = useTranslation()
  const savedProvider = useAppStore((s) => s.config.web_search?.provider ?? 'none')
  const [choice, setChoice] = useState<Choice>(savedProvider === 'searxng' ? 'own' : 'builtin')
  const choices: { id: Choice; title: string; detail: string; tag?: string }[] = [
    {
      id: 'builtin',
      title: t('webSearch.builtin'),
      detail: t('webSearch.builtinDetail'),
      tag: t('webSearch.recommended'),
    },
    { id: 'own', title: t('webSearch.own'), detail: t('webSearch.ownDetail') },
  ]
  return (
    <div className="flex flex-col gap-3" data-testid="web-search-setup">
      <div role="radiogroup" aria-label={t('webSearch.uses')} className="option-cards w-full">
        {choices.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={choice === option.id}
            onClick={() => setChoice(option.id)}
            className="option-card"
          >
            <span className="option-card-title">
              {option.title}
              {option.tag && <span className="tag">{option.tag}</span>}
            </span>
            <span className="option-card-detail">{option.detail}</span>
          </button>
        ))}
      </div>
      {choice === 'builtin' ? (
        <BuiltinCard onboarding={onboarding} />
      ) : (
        <WebSearchForm idPrefix={idPrefix} fixedProvider />
      )}
    </div>
  )
}

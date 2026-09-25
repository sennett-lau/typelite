import { useCallback, useEffect, useRef, useState } from 'react'
import { readCredential, setCredential } from '../lib/tauri'
import { clearTestResult } from '../lib/readiness'

/**
 * The optional API key of one preset. Keys never go into the config file: they are read
 * from and written to the macOS Keychain (through the backend's credential commands),
 * under `namespace` ('stt' or 'llm') plus the preset id.
 *
 * Typing is saved after a short pause; `saveNow` saves at once (for example on blur).
 * Typing also forgets the preset's passed Test, because that Test used the old key (the
 * backend does the same when the saved key changes).
 */
export function usePresetApiKey(namespace: 'stt' | 'llm', presetId: string) {
  const [apiKey, setApiKeyState] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True once the user has typed; stops a blur from overwriting a key that is still loading.
  const edited = useRef(false)

  useEffect(() => {
    let cancelled = false
    setApiKeyState('')
    setSaveError(null)
    edited.current = false
    if (!presetId) return
    readCredential(namespace, presetId)
      .then((secret) => {
        if (!cancelled && !edited.current) setApiKeyState(secret ?? '')
      })
      .catch((error) => console.error(`[credentials] failed to read ${namespace} key`, error))
    return () => {
      cancelled = true
    }
  }, [namespace, presetId])

  const save = useCallback(
    (value: string, delayMs: number) => {
      if (!presetId) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        setCredential(namespace, presetId, value)
          .then(() => setSaveError(null))
          .catch((error) => {
            setSaveError(error instanceof Error ? error.message : String(error))
            console.error(`[credentials] failed to save ${namespace} key`, error)
          })
      }, delayMs)
    },
    [namespace, presetId],
  )

  const setApiKey = useCallback(
    (value: string) => {
      edited.current = true
      setApiKeyState(value)
      clearTestResult(namespace === 'stt' ? 'speech' : 'ai', presetId)
      save(value, 350)
    },
    [namespace, presetId, save],
  )

  const saveNow = useCallback(() => {
    if (edited.current) save(apiKey, 0)
  }, [apiKey, save])

  return { apiKey, setApiKey, saveNow, saveError }
}

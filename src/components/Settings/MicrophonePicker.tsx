import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { RefreshCw } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { listInputDevices, startMicLevelMonitor, stopMicLevelMonitor } from '../../lib/tauri'
import type { InputDeviceInfo, MicMonitorInfo } from '../../lib/tauri'
import { rmsToLevel } from '../../lib/waveform'
import { Row } from '../ui/Group'

/** Backend event with the live input level (RMS, 0–1). */
const MIC_LEVEL_EVENT = 'mic:level'

interface MicrophonePickerProps {
  /** Saved device name; '' means "System default". */
  value: string
  onChange: (value: string) => void
  /** Row label; defaults to "Input device". */
  label?: string
}

/**
 * Microphone picker with a live level meter.
 *
 * The meter opens the selected device through the backend (cpal/CoreAudio), which is also what
 * triggers the macOS Microphone permission prompt. It runs only while this picker is mounted, the
 * window is visible and no recording is in progress.
 */
export function MicrophonePicker({ value, onChange, label }: MicrophonePickerProps) {
  const { t } = useTranslation()
  const selectId = useId()
  const pipelineIdle = useAppStore((s) => s.pipelineState === 'idle')
  const [devices, setDevices] = useState<InputDeviceInfo[] | null>(null)
  const [listFailed, setListFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState(0)
  const [monitorInfo, setMonitorInfo] = useState<MicMonitorInfo | null>(null)
  const [monitorFailed, setMonitorFailed] = useState(false)
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )
  // Serialise start/stop calls so a late "stop" never kills a newer meter.
  const monitorQueueRef = useRef<Promise<unknown>>(Promise.resolve())

  const refreshDevices = useCallback(() => {
    setLoading(true)
    listInputDevices()
      .then((list) => {
        setDevices(list)
        setListFailed(false)
      })
      .catch((err) => {
        console.error('Failed to list microphones:', err)
        setListFailed(true)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    listen<number>(MIC_LEVEL_EVENT, (event) => {
      setLevel(typeof event.payload === 'number' ? event.payload : 0)
    })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch((err) => console.error('Failed to listen for mic level:', err))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const monitorActive = pipelineIdle && pageVisible
  useEffect(() => {
    if (!monitorActive) {
      setLevel(0)
      return
    }
    let cancelled = false
    setMonitorFailed(false)
    monitorQueueRef.current = monitorQueueRef.current
      .catch(() => {})
      .then(() => startMicLevelMonitor(value))
      .then(
        (info) => {
          if (!cancelled) setMonitorInfo(info)
        },
        (err) => {
          if (cancelled || err === 'recording_active') return
          console.error('Failed to start mic level monitor:', err)
          setMonitorFailed(true)
        },
      )
    return () => {
      cancelled = true
      setLevel(0)
      monitorQueueRef.current = monitorQueueRef.current
        .catch(() => {})
        .then(() => stopMicLevelMonitor())
        .catch((err) => console.error('Failed to stop mic level monitor:', err))
    }
  }, [monitorActive, value])

  const defaultDevice = devices?.find((device) => device.is_default)
  const savedDeviceMissing =
    value !== '' &&
    ((devices !== null && !devices.some((device) => device.name === value)) ||
      (monitorInfo?.requested_device_missing ?? false))
  const fraction = monitorActive ? rmsToLevel(level) : 0

  // Rows for a grouped list: the device pop-up, the level meter, then any notes.
  return (
    <>
      <Row label={label ?? t('mic.label')} htmlFor={selectId}>
        <select
          id={selectId}
          aria-label={label ?? t('mic.label')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="popup w-[240px]"
        >
          <option value="">
            {defaultDevice
              ? t('mic.systemDefaultWithName', { name: defaultDevice.name })
              : t('mic.systemDefault')}
          </option>
          {(devices ?? []).map((device) => (
            <option key={device.name} value={device.name}>
              {device.name}
            </option>
          ))}
          {savedDeviceMissing && !(devices ?? []).some((device) => device.name === value) && (
            <option value={value}>{t('mic.notConnected', { name: value })}</option>
          )}
        </select>
        <button
          type="button"
          aria-label={t('mic.refresh')}
          title={t('mic.refresh')}
          onClick={refreshDevices}
          disabled={loading}
          className="btn-icon"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </Row>

      <Row
        label={t('mic.level')}
        help={pipelineIdle ? t('mic.bluetoothHint') : t('mic.meterPaused')}
      >
        <div
          role="meter"
          aria-label={t('mic.level')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          className="h-[5px] w-[120px] overflow-hidden rounded-full bg-bg-secondary"
        >
          <div
            data-testid="mic-level-bar"
            className="h-full rounded-full bg-accent transition-[width] duration-75"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      </Row>

      {(savedDeviceMissing || listFailed || monitorFailed) && (
        <Row>
          <div className="space-y-1 text-[12px] leading-relaxed">
            {savedDeviceMissing && (
              <p className="text-warning">{t('mic.missing', { name: value })}</p>
            )}
            {listFailed && <p className="text-error">{t('mic.listFailed')}</p>}
            {monitorFailed && <p className="text-error">{t('mic.monitorFailed')}</p>}
          </div>
        </Row>
      )}
    </>
  )
}

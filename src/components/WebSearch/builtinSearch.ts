import type { BuiltinSearchProgress, BuiltinSearchStep } from '../../lib/tauri'

/** The setup steps in order, as the progress list shows them. */
export const STEPS: BuiltinSearchStep[] = [
  'downloadingUv',
  'installingPython',
  'downloadingSearxng',
  'installingLibraries',
  'starting',
]
/** "28 Sep 2026 (4e2c1ea)" from a commit and its ISO date. */
export function versionLabel(commit: string, commitDate: string): string {
  const date = new Date(commitDate)
  const day = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${day} (${commit.slice(0, 7)})`.trim()
}

/** Share of the setup done, for the bar: finished steps plus the running download. */
export function progressShare(progress: BuiltinSearchProgress | null): number {
  if (!progress) return 0.02
  if (progress.step === 'done') return 1
  const index = Math.max(0, STEPS.indexOf(progress.step))
  const within =
    progress.done != null && progress.total ? Math.min(1, progress.done / progress.total) : 0
  return (index + within) / STEPS.length
}

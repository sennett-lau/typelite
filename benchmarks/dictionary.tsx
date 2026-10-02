import { createHash } from 'node:crypto'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { expect } from 'vitest'
import { DictionaryPane } from '../src/components/Settings/DictionaryPane'
import { useAppStore, type CorrectionRule, type DictionaryEntry } from '../src/stores/appStore'

const ROWS = 1000
const dictionary: DictionaryEntry[] = Array.from({ length: ROWS }, (_, index) => ({
  id: index + 1,
  word: `term_${String(index).padStart(4, '0')}`,
  pronunciation: index % 4 === 0 ? null : `sound_${index}`,
}))
const corrections: CorrectionRule[] = Array.from({ length: ROWS }, (_, index) => ({
  id: index + 1,
  pattern: `mistake_${String(index).padStart(4, '0')}`,
  replacement: `correct_${index}`,
  enabled: index % 3 !== 0,
}))

const workloads = [
  {
    id: 'words',
    placeholders: ['dictionary.word', 'dictionary.pronunciationOptional'],
    values: ['newbenchmark', 'pronounce_it'],
    row_label_key: 'dictionary.editEntry',
    expectedRows: dictionary.map((entry) => ({
      label: `dictionary.editEntry ${entry.word}`,
      text: `${entry.word}${entry.pronunciation ?? '—'}`,
      enabled: null,
    })),
  },
  {
    id: 'corrections',
    placeholders: ['dictionary.wrongPhrase', 'dictionary.correctPhrase'],
    values: ['tehbenchmark', 'thebenchmark'],
    row_label_key: 'dictionary.editCorrection',
    expectedRows: corrections.map((rule) => ({
      label: `dictionary.editCorrection ${rule.pattern}`,
      text: `${rule.pattern}${rule.replacement}`,
      enabled: String(rule.enabled),
    })),
  },
] as const

function renderedRows(container: HTMLElement, key: string) {
  return Array.from(container.querySelectorAll(`button[title="${key}"]`)).map((button) => {
    const row = button.closest('.row')!
    return {
      label: button.getAttribute('aria-label'),
      text: row.textContent,
      enabled: row.querySelector('[role="switch"]')?.getAttribute('aria-checked') ?? null,
    }
  })
}

/**
 * The caller's stable i18n mock returns keys and increments a numeric counter for each key.
 * Read the counter here, rather than retaining tens of thousands of vi.fn call arguments.
 * Typing needs no native API: the actual pane, store, inputs, rows and icons remain mounted.
 */
export function dictionaryBenchmarks(
  warmups: number,
  samples: number,
  translationCalls: (key: string) => number,
) {
  const results = []
  try {
    for (const workload of workloads) {
      useAppStore.setState(
        { ...useAppStore.getInitialState(), dictionary, correctionRules: corrections },
        true,
      )
      const beforeMountCalls = translationCalls(workload.row_label_key)
      const view = render(<DictionaryPane />)
      if (workload.id === 'corrections') {
        fireEvent.click(view.getByRole('button', { name: 'dictionary.corrections', exact: true }))
      }
      // Prove the stable translation mock counts the actual mounted rows. A disconnected
      // counter returning zero must never look like a successful render optimization.
      expect(translationCalls(workload.row_label_key) - beforeMountCalls).toBe(ROWS * 2)
      const inputs = workload.placeholders.map(
        (placeholder) => view.getByPlaceholderText(placeholder) as HTMLInputElement,
      )
      expect(renderedRows(view.container, workload.row_label_key)).toEqual(workload.expectedRows)
      const edits = workload.values.flatMap((value, field) =>
        Array.from(value, (_, index) => ({ field, value: value.slice(0, index + 1) })),
      )
      expect(edits).toHaveLength(24)
      const timings = []
      const rowLabelCalls = []
      for (let sample = -warmups; sample < samples; sample++) {
        // Reuse the mounted list to measure typing into an already open dictionary. Reset,
        // queries, row snapshots and assertions stay outside the measured batch.
        for (const input of inputs) fireEvent.change(input, { target: { value: '' } })
        const beforeCalls = translationCalls(workload.row_label_key)
        const start = performance.now()
        for (const edit of edits) {
          fireEvent.change(inputs[edit.field], { target: { value: edit.value } })
        }
        const elapsed = (performance.now() - start) * 1000
        const calls = translationCalls(workload.row_label_key) - beforeCalls
        expect(calls).toBeGreaterThanOrEqual(0)
        expect(calls % 2).toBe(0)
        if (sample >= 0) {
          timings.push(elapsed)
          rowLabelCalls.push(calls)
        }
        expect(inputs.map((input) => input.value)).toEqual(workload.values)
        expect(renderedRows(view.container, workload.row_label_key)).toEqual(workload.expectedRows)
        expect(useAppStore.getState().dictionary).toBe(dictionary)
        expect(useAppStore.getState().correctionRules).toBe(corrections)
      }

      // Both Add forms currently keep their drafts when the section switches. The faster
      // implementation must preserve that behavior even when input state moves into a child.
      const otherSection = workload.id === 'words' ? 'corrections' : 'words'
      fireEvent.click(view.getByRole('button', { name: `dictionary.${otherSection}`, exact: true }))
      fireEvent.click(view.getByRole('button', { name: `dictionary.${workload.id}`, exact: true }))
      for (const [index, placeholder] of workload.placeholders.entries()) {
        expect(view.getByPlaceholderText(placeholder)).toHaveValue(workload.values[index])
      }
      expect(renderedRows(view.container, workload.row_label_key)).toEqual(workload.expectedRows)
      view.unmount()
      cleanup()
      expect(view.container.childElementCount).toBe(0)
      results.push({
        id: `ui/dictionary/add-${workload.id}`,
        unit: 'us/batch',
        workload: {
          visible_rows: ROWS,
          input_events: edits.length,
          fields: inputs.length,
          row_label_key: workload.row_label_key,
          label_calls_per_row: 2,
          warmups,
          samples,
          mode: 'React dev/jsdom; actual DictionaryPane; mounted list; independent input events',
        },
        samples_us: timings,
        row_label_calls_per_batch: rowLabelCalls,
        row_evaluations_per_batch: rowLabelCalls.map((calls) => calls / 2),
        rows_sha256: createHash('sha256').update(JSON.stringify(workload.expectedRows)).digest('hex'),
        final_input_values: workload.values,
      })
    }
    return results
  } finally {
    cleanup()
    useAppStore.setState(useAppStore.getInitialState(), true)
  }
}

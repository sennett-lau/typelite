import { Fragment } from 'react'
import type { KeyTokenName } from './keyTokens'

/** Small inline key caps joined by "+", for use inside a sentence. */
export function KeyCaps({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 && ' + '}
          <kbd className="kbd kbd-inline">{key}</kbd>
        </Fragment>
      ))}
    </>
  )
}

/**
 * A translated sentence with inline key caps: `text` comes from `t(…, KEY_TOKENS)`, and each
 * marker becomes the matching group of caps. Plain inline text, so it wraps like a sentence.
 */
export function KeyText({
  text,
  keys,
}: {
  text: string
  keys: Partial<Record<KeyTokenName, string[]>>
}) {
  const parts = text.split(/⟦(key|stop|switch)⟧/)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <KeyCaps key={index} keys={keys[part as KeyTokenName] ?? []} />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}

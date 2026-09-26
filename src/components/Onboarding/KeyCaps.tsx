import { Fragment } from 'react'
import { KeyCaps as SharedKeyCaps } from '../ui/KeyCap'
import type { KeyTokenName } from './keyTokens'

/** Small inline key caps joined by "+", for use inside a sentence. `keys` are key names. */
export function KeyCaps({ keys }: { keys: string[] }) {
  return <SharedKeyCaps keys={keys} className="kbd kbd-inline" joiner="plus" />
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

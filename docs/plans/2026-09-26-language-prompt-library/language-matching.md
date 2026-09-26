# Language matching

How the app finds the presets for a language code the user selected, in which order it shows
them, and how the shared English preset serves every English variant. Back to [index](index.md).

## Step 1: normalise the selected code

- Case is fixed (`zh-hant-hk` → `zh-Hant-HK`), `_` becomes `-`.
- Chinese and Cantonese get their script, because the script decides the characters and is
  ambiguous without it (a small fixed table, taken from CLDR likely subtags):

  | Selected | Normalised |
  |---|---|
  | `zh`, `zh-CN`, `zh-SG` | `zh-Hans`, `zh-Hans-CN`, `zh-Hans-SG` |
  | `zh-HK`, `zh-MO`, `zh-TW` | `zh-Hant-HK`, `zh-Hant-MO`, `zh-Hant-TW` |
  | `yue`, `yue-HK` | `yue-Hant-HK` |
  | `yue-CN` | `yue-Hans-CN` |

- No other language gets a script or region added: `en` stays `en`, so it matches only presets
  for all of English, not presets written for `en-US`.

## Step 2: collect matches

A preset tag **matches** the selected code when it equals the code or is a prefix of it at a
`-` boundary. Its **specificity** is its number of subtags.

| Preset tag | `en-GB` | `en` | `zh-Hant-HK` | `yue-Hant-HK` |
|---|---|---|---|---|
| `en` | yes (1) | yes (1) | | |
| `en-GB` | yes (2) | no | | |
| `zh` | | | yes (1) | via macrolanguage |
| `zh-Hant` | | | yes (2) | via macrolanguage |
| `zh-Hant-HK` | | | yes (3) | via macrolanguage |
| `yue-Hant-HK` | | | | yes (3) |

- A preset matches when any of its tags matches; it takes the highest specificity of those.
- **Macrolanguage step:** if nothing or little is found for an individual language that belongs
  to a macrolanguage (`yue` and `cmn` belong to `zh`), the code is also tried with the
  macrolanguage (`yue-Hant-HK` → `zh-Hant-HK`). These matches rank below every direct match. A
  preset that is really about Cantonese lists both `zh-Hant-HK` and `yue-Hant-HK`, so it is a
  direct match either way.
- A selected code that is shorter than a preset tag never matches it: choosing plain `en` does
  not show a preset written only for `en-AU`. Those appear in step 4.

## Step 3: order

1. Direct matches before macrolanguage matches.
2. Higher specificity first (a preset written for `en-GB` above the shared `en` one).
3. `official` before `community`.
4. Name, alphabetically.

Deprecated presets and presets with an unknown `format` are left out.

## Step 4: related presets

Presets for the same primary language that did not match (for `zh-Hant-HK`: a `zh-Hant-TW`
preset; for `en`: an `en-AU` one) are listed under a collapsed "Other <language> presets"
heading. The user can still pick one; it is then used as is.

## Worked example: en-GB and the shared English preset

The library holds:

| id | languages | tier |
|---|---|---|
| `english` | `[en]` with `## Variant: en-GB`, `en-US`, `en-AU` | official |
| `british-plain-legal` (hypothetical) | `[en-GB]` | community |
| `english-australia-casual` (hypothetical) | `[en-AU]` | community |

The user adds **English (United Kingdom)**, code `en-GB`:

1. Normalise: `en-GB` stays `en-GB`.
2. Match: `british-plain-legal` via `en-GB` (specificity 2); `english` via `en`
   (specificity 1). `english-australia-casual` does not match.
3. Order: `british-plain-legal` (2), then `english` (1). Related: `english-australia-casual`.
4. The user picks `english`. The app downloads `english/preset.md` (the same file, size and
   hash as for any other English variant), and renders it for `en-GB`: the Instructions, then
   "Notes for en-GB:" with the `en-GB` variant text, then the Examples.

Later they add **English (United States)**, `en-US`. `english` matches again via `en`; the file
is already downloaded (same id, version and hash), so nothing is fetched. It is rendered for
`en-US` with the `en-US` note instead. **English (New Zealand)**, `en-NZ`, also gets `english`,
rendered with no note because there is no `en-NZ` variant section, until someone adds one: a
pull request of a few lines in the same file, not a new preset.

## Considered

- **Full RFC 4647 lookup with every CLDR alias**: the preset set is small; a prefix match plus
  a short table covers the real cases and is easy to explain in the contributor guide.
- **Adding likely regions to every code** (`en` → `en-Latn-US`): would make plain `en` match
  US-only presets, which is wrong for a user who never said US.
- **Matching in both directions** (plain `en` also matches `en-AU` presets directly): mixes
  regional presets into the general case; they stay reachable under "related".

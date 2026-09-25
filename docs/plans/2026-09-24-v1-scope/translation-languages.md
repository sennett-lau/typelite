# Translation languages

Pick a few target languages ahead of time and switch between them quickly. Back to [index](index.md).

## Today

More exists than it first looked:

- Settings has a target-language list (`components/Settings/TranslationTargets.tsx`): up to 5
  languages, reorderable, with one marked active.
- While recording in Translate mode, the capsule shows a chip with the active language
  (`components/Capsule/TranslateTargetChip.tsx`); clicking it opens a menu to switch.

## Target (Typeless-style)

- The user pre-selects **three** target languages in Settings. Three is the default and the
  number shown in the UI. The existing limit of 5 can stay underneath.
- While recording in Translate mode, the capsule shows the three languages as small chips with
  the active one highlighted. Switching is one click, and also possible from the keyboard
  without leaving the target app (for example pressing the translate combo's extra key again to
  cycle). The exact key is an open question.
- The last-used language is remembered and used by default next time.
- The chosen language is visible before the text is pasted, so there are no surprises.

## Open points

- Confirm exactly how Typeless presents its three languages (chips in the pill, a menu, or
  separate shortcuts) and match it. Check once the fixed capsule shows the existing chip.
- Whether Translate also works on selected text (translate what is highlighted) or only on speech.

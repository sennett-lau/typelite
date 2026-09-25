# Focus check and the Copy pill flow

How Typelite decides there is nowhere to paste, and what happens to the result then.
Back to [index.md](index.md).

## The decision

Right before a Dictate or Translate result would be pasted, Typelite asks macOS Accessibility
for the system-wide focused element (the element keyboard input goes to, in the frontmost app)
and reads its role, its subrole, and whether its value or its selected-text range can be set.
Only role names and flags are read, never text; the log line names the role only.

| Found | Decision |
|---|---|
| Role `AXTextField`, `AXTextArea`, `AXComboBox`, `AXSearchField`, or a search or secure text subrole | Editable |
| Any role whose selected-text range can be set, or that sits in editable web content (`AXEditableAncestor`) | Editable |
| A clearly non-text role: list, outline, column browser, button, check box, radio button, pop-up, slider, image, tab group, toolbar, menu, link and similar | Not editable |
| Any other role whose value can be set | Editable |
| Anything else: groups, scroll areas, windows, web areas without editable content, tables, canvases, no focused element, an error, no permission | Unknown |

Only "not editable" skips the paste. "Unknown" pastes as before: Electron and Chromium apps
(before their accessibility tree is on), terminals and other custom-drawn views, Office and
design-tool canvases, games and the plain body of a web page all report roles Typelite cannot
trust. The role wins over a settable value for the non-text roles, because sliders, check
boxes and pop-ups have a settable value too.

Each attribute read is a message to the focused app, capped at 0.15 s so a hung app cannot
stall the paste. A healthy app answers in well under a millisecond; a text field is known after
three reads (focused element, role, subrole).

## When it is checked

- One-shot output (the normal case): just before pasting, after the target app check. Copy-only
  output and a changed target app keep their existing clipboard fallback and never check.
- Streaming insertion types while the AI is still writing, so the check runs once before
  streaming starts. With no text field the run does not stream; its final result then takes
  the one-shot check again (the user may have clicked into a field meanwhile).
- Raw-transcript output (AI polish off, or the AI failed) takes the same check. A translation
  carries its target language to the pill's language tag.
- Ask anything never uses the Copy pill.

## The held result

When the result is held, nothing is pasted and the clipboard is untouched. The result stays in
memory only while the pill is up. The pill closes on Copy (after "Copied"), when its countdown
runs out, on Escape (the native key listener swallows Escape only while the pill offers a
result; a running run still wins), and when any new run starts, Ask included.

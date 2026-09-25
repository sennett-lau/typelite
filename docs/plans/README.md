# Plans

A plan explains **what we are building and why, and how the parts fit together**. It is not a
to-do list. Tasks, checklists and progress tracking belong elsewhere (issues, PRs, commits).

## Where plans go

Every plan is its own folder under `docs/plans/`:

```
docs/plans/
  README.md                        ← this file (the rules)
  2026-09-24-initial-concept/
    index.md
    product.md
    architecture.md
    ...
  2026-10-02-<next-feature>/
    index.md
    ...
```

- Folder name: `YYYY-MM-DD-short-slug`. The date is the day the plan was created; it only orders
  the folders. `short-slug` is lowercase kebab-case, 2–4 words, and it alone identifies the plan.
- The slug must be unique across `docs/plans/`. Check before you create a folder; if the slug is
  taken, choose a more specific one. There is no running number, so plans made on different
  branches do not collide. A dropped plan keeps its folder, so its slug stays taken.
- One folder per feature or major change. Do not put two features in one plan.

## Referring to a plan

- Refer to a plan by its slug, never by a number or by the date alone: "plan `quick-speech-setup`".
- Inside `docs/`, link to the folder with a relative path, for example
  `[quick-speech-setup](../2026-09-25-quick-speech-setup/index.md)`.
- In code comments and tests, use the same form: "Plan `quick-speech-setup`: ..." or
  "(plan `quick-speech-setup`)".

## What goes in a plan folder

- **`index.md` (required).** The entry point. It must contain, in this order:
  1. Title and a one-paragraph summary.
  2. Status line: `Status: draft | agreed | building | done | dropped` and the date it last changed.
  3. Goals and non-goals.
  4. Key decisions, each with a one-line reason.
  5. A table of the part files: file, what it covers.
  6. Open questions.
- **Part files (one per topic).** Small Markdown files, one subject each (for example
  `product.md`, `architecture.md`, `permissions.md`). Split a file when it covers two subjects
  or goes past about 200 lines. Each part file starts with a `# Title` and a one-line purpose,
  and links back to `index.md`.

## Writing rules

- Describe intent, behaviour and structure. No step-by-step tasks, no checkboxes.
- State decisions plainly and give the reason. Keep rejected alternatives short, in a
  "Considered" section, so nobody re-argues them.
- Put unresolved items under "Open questions" in `index.md`, not scattered through the files.
- Diagrams: small ASCII or Mermaid blocks only.
- When a later plan changes a decision in an earlier one, say so in the new plan's `index.md`
  and add a one-line "Superseded by <slug>" note in the old plan's `index.md`. Do not rewrite
  history in the old plan.
- Update the status line when the plan's state changes.

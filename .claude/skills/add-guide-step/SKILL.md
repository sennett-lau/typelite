---
name: add-guide-step
description: Create the guide folder for a new part of Typelite's pipeline (a new "step" with its own models and services, beside speech recognition and AI polish), in the step format the docs check enforces. Use when a new kind of system is added and needs user guides.
---

# Add a guide step

The format is in [CONTRIBUTING.md → Guide steps](../../../CONTRIBUTING.md#guide-steps). Read it
first, and use `docs/guides/ai-polish/` as the example to copy from.

1. **Ask:** the step's name and slug, what it does in the pipeline, its connections (Built-in?
   OpenAI-compatible? its own?), and the services and models known to work. A step documents
   what the code does; if the feature is not built yet, point to its plan instead.
2. **Create** `docs/guides/<step>/` with `README.md` (what it does, `## Connections`,
   `## Services` with the exact Services header, `## More`), one page per connection
   (with `## Running your own server` and `## Cloud services` where they apply), `built-in.md`
   if it has one, and `troubleshooting.md`. Only `.md` pages, no subfolders.
3. **Create** `docs/guides/models/<step>.md`: kinds of model, by hardware, by language.
4. **Register** the step in `STEPS` in `scripts/docs-cards.mjs` and in its test, and add rows to
   the guide tables in `docs/guides/README.md`, `docs/guides/models/README.md` and `README.md`.
5. **Check:** `npm run docs:check` and `npx vitest run src/lib/__tests__/docsCards.test.ts`.
   Show the diff; do not commit unless asked.

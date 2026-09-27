---
name: add-language-guide
description: Write a community language guide (docs/guides/languages/<id>.md) that recommends the speech model, AI polish model and language preset for one language, in the format the docs check enforces. Use when someone wants Typelite to handle their language or dialect better and has tested a setup.
---

# Add a language guide

The format is in [CONTRIBUTING.md → Language guides](../../../CONTRIBUTING.md#language-guides)
(the guide file, the template and the review checklist). Read it first, and read
[the Cantonese guide](../../../docs/guides/languages/cantonese.md) as the worked example.

1. **Does the language need a guide?** Follow the check on the
   [Languages page](../../../docs/guides/languages/README.md#language-guides): if the speech model
   already keeps the user's words, a language preset is enough; say so and stop, or offer
   `add-language-preset`.
2. **Ask** (skip what the user already said): the language and region, its language tags, the
   speech model and polish model they tested, how they ran them (hardware, server), the preset,
   the GitHub usernames of the authors, and a real example of what the general setup got wrong.
   Do not invent examples or numbers; leave **Results** out if nothing was measured.
3. **Write** `docs/guides/languages/<id>.md` from the template: front matter, then
   `## Recommended setup`, `## Why`, `## Set it up`, and if there is data `## Results` and
   `## Known issues`. `tier: community` unless a maintainer says otherwise. Link to the setup
   guides (for example `../speech/openai-compatible.md#qwen3-asr`) instead of repeating them.
4. **Preset:** if the guide names one that does not exist yet, offer `add-language-preset` in the
   same change.
5. **Check:** `npm run docs:cards` (validates and rewrites the index on the Languages page), then
   `npm run docs:check`. Go through the review checklist with the user. Show the diff; do not
   commit unless asked.

Never write private addresses, machine names or keys.

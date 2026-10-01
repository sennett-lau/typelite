# UI

Settings → Search and the onboarding step, with the two providers. Back to [index.md](index.md).
The screens are drafted as a mockup for review before they are built; this file records what
is agreed.

## Providers

- **Built-in (recommended)**: set up and run by Typelite on this Mac.
- **Your own SearXNG**: an address and an optional key, as in plan `ask-web-search`.
- Off: no web search.

## States of Built-in

| State | Shows |
|---|---|
| Not set up | What it downloads (about 200 MB), where it runs, a Set up button |
| Setting up | The current step and a progress bar; Cancel |
| Ready | Installed version and date, Running / Starts when needed, Test, Check for updates, Remove |
| Update available | The new version's date and an Update button |
| Failed | The step that failed and why; Try again |

## Sidebar status

A third line under Speech and AI: **Search · Built-in**, **Search · <host>** (your own SearXNG) or
**Search · Off**. Its dot is green after a working Test or Ask search with the provider in use,
red after a failure, and grey before either or while search is off. As with the other two, the
app never polls; a result counts only for the provider and address that gave it.

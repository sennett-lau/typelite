# Built-in web search: SearXNG set up by Typelite

Web search for Ask (plan [ask-web-search](../2026-09-29-ask-web-search/index.md)) needs a SearXNG
server. Running one by hand (Docker, or Python) is too much for most people, so Typelite offers
a **Built-in** search provider next to "Your own SearXNG": one button downloads SearXNG with a
private Python into Typelite's data folder, starts it on this Mac only, and keeps it up to date.
The existing provider, with the user's own address and optional key, stays as it is.

Status: building — 2026-09-29

## Goals

- One click from nothing to working web search, with no Docker, Python or git on the Mac.
- Nothing is downloaded or run until the user presses Set up.
- SearXNG can be brought up to date from Settings, because search engines change often.
- The server is reachable from this Mac only and runs only while Typelite runs.

## Non-goals

- Shipping SearXNG inside the app bundle.
- Sharing the built-in server with other computers (use "Your own SearXNG" for that).
- Editing SearXNG's engines or preferences from Typelite.

## Key decisions

| Decision | Reason |
|---|---|
| Download SearXNG at the user's request, never bundle it | SearXNG is AGPL-3.0; kept a separate program the user fetches, Typelite stays MIT. It also avoids a 100 MB bundle and a frozen copy whose engine scrapers go stale. |
| Use `uv` (MIT/Apache) to fetch a standalone Python and install SearXNG's libraries | macOS has no Python 3.11+ by default; uv is one small binary, needs nothing installed and keeps everything inside Typelite's folder. |
| uv comes from its GitHub release, checked against the release's published SHA-256 | A known file, verified before it runs. |
| SearXNG comes from a specific commit of its `master` branch (the latest when set up), recorded as the installed version | SearXNG has no releases; a commit id makes "installed" and "update available" exact. |
| The server listens on `127.0.0.1` on a free port, with JSON on and the limiter off | Only this Mac can reach it; the limiter is for public servers. |
| Typelite starts it when Ask first needs it (or at launch when Built-in is chosen) and stops it at quit, like the built-in AI server | No background service outside the app; the same lifecycle the user knows from Built-in AI. |
| An update installs the new commit into a new folder and switches only when it works | A failed update never breaks working search. |

## Parts

| File | Covers |
|---|---|
| [architecture.md](architecture.md) | Files on disk, the setup and update steps, the server's lifecycle, commands and events. |
| [ui.md](ui.md) | Settings → Search and the onboarding step with Built-in and Your own SearXNG. |

## Open questions

- Whether to check for SearXNG updates automatically (a request to GitHub) or only when the user
  presses Check for updates. Until decided: only on request.

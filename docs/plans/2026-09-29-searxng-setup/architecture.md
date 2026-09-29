# Architecture

How the built-in SearXNG is installed, run and updated. Back to [index.md](index.md).

## Files

Everything lives in `<app data>/search/` (`~/Library/Application Support/dev.typelite.mac/search/`):

```
search/
  bin/uv                  uv, from its GitHub release (checked with SHA-256)
  python/                 the standalone Python uv downloads (UV_PYTHON_INSTALL_DIR)
  searxng-<commit>/       one SearXNG install: source + .venv with its libraries
  settings.yml            SearXNG settings written by Typelite
  installed.json          the active commit, its date, and when it was set up
  searxng.log             the server's output (no questions: SearXNG does not log queries)
```

Remove deletes the whole folder.

## Setup

```
download uv ──> check SHA-256 ──> uv python install 3.12
            ──> ask GitHub for master's latest commit ──> download that commit's tarball
            ──> unpack into searxng-<commit>/ ──> uv venv + install SearXNG and its libraries
            ──> write settings.yml ──> start ──> test one search ──> write installed.json
```

Each step reports progress (`search:setup_progress` with the step and, for downloads, bytes).
A failure stops the setup, leaves any older working install in place and reports the step and
the reason. The steps are the same on a second run, reusing what is already there (uv, Python).

## Update

Check for updates compares the latest `master` commit with `installed.json`. Update runs the
SearXNG part of setup into a new `searxng-<commit>/`, starts it on a spare port, tests one search,
then switches `installed.json` to it and deletes the old folder. If any step fails, the old
install keeps running.

## Server

- Command: `<install>/.venv/bin/python -m searx.webapp`, with `SEARXNG_SETTINGS_PATH` pointing at
  `settings.yml`, the working directory in the install folder.
- `settings.yml`: `use_default_settings: true`, `bind_address: 127.0.0.1`, the chosen port, a
  random `secret_key` made at setup, `limiter: false`, `formats: [html, json]`.
- The port: 8888 when free, else a free port picked at start; written into `settings.yml`.
- Started lazily by the first web search (a search waits up to 10 s for it to answer) and at
  launch when Built-in is the chosen provider. Stopped on `RunEvent::Exit`. A crashed server is
  started again by the next search.

## Provider

`WebSearchConfig.provider` gains `builtin`. With it, `base_url` is not used: a search asks the
server manager for the running address and then searches it like any SearXNG. When Built-in is
chosen but not set up, Ask shows the "search is not set up" panel.

## Commands

| Command | Does |
|---|---|
| `builtin_search_status` | Installed commit and date, running or not, the port, the setup in progress |
| `install_builtin_search` | Runs setup; progress by event; returns the status |
| `check_builtin_search_update` | The latest commit and whether it differs from the installed one |
| `update_builtin_search` | Runs update; progress by event |
| `remove_builtin_search` | Stops the server and deletes `search/`; the provider falls back to off |

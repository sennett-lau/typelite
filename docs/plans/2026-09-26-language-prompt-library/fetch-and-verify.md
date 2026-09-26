# Fetch and verify

Where the app downloads the library from, the index format, the hash check, caching and what
happens offline. Back to [index](index.md).

## Address

```
https://raw.githubusercontent.com/sennett-lau/typelite/main/presets/languages/index.json
https://raw.githubusercontent.com/sennett-lau/typelite/main/presets/languages/<path>
```

- The base address is one constant in the app (`LIBRARY_BASE_URL` in `llm/language_library.rs`),
  in the same style as `MODEL_BASE_URL`.
- The **main branch**, because a merged preset should reach users without an app release; the
  library is data, reviewed on merge.
- Integrity comes from the index: the app downloads a preset and accepts it only if its byte
  size and SHA-256 equal the index entry, like the Whisper model downloads in `stt/models.rs`.
  A mismatch usually means the preset changed on `main` after the index was fetched, so the app
  fetches the index again once and retries; a second mismatch is an error ("The preset could
  not be verified"). A file that matches but fails validation is rejected the same way.
- The repository must be public for this address to work.

## index.json

```json
{
  "format": 1,
  "presets": [
    {
      "id": "english",
      "name": "English",
      "version": 1,
      "format": 1,
      "tier": "official",
      "languages": ["en"],
      "variants": ["en-AU", "en-CA", "en-GB", "en-US"],
      "applies_to": ["polish", "translate"],
      "summary": "Clear, natural English that keeps the speaker's tone, with spelling per region.",
      "authors": ["sennett-lau"],
      "model_hint": "Works with small 4B instruct models.",
      "path": "english/preset.md",
      "bytes": 1843,
      "sha256": "…"
    }
  ]
}
```

- Sorted by id; no timestamp, no commit hash, so the file only changes when a preset does.
- `variants` lets the list say "has notes for en-GB" without downloading the preset.
- The app ignores unknown fields and skips entries whose `format` it does not know, so the
  index can grow.
- Size: about 500 bytes per preset; a few hundred presets stay well under 200 KB.

## Flow

```
Add language ─> fetch index.json (or use cache) ─> match + order ─> list
pick preset ─> GET <path> ─> check bytes + SHA-256 ─> parse + validate (same rules as CI)
            ─> show full rendered text ─> "Use this" ─> save local copy + language setting
```

## Local copy

- `<app data>/language-presets/<id>/<sha256>.md`: one file per downloaded version, named by its
  hash, shared by every language that uses it (en-GB and en-US use one `english` file). Keeping
  versions apart means previewing a newer version never breaks a language that still uses the
  older one. Files no language uses any more are removed after the next download of that id,
  except the newest.
- `<app data>/language-presets/index.json` is the cached index; `index-meta.json` next to it
  holds the `ETag` of the last response and when the index was last fetched. The next fetch
  sends `If-None-Match`, so an unchanged index costs one small response.
- `<app data>/language-presets/updates.json` remembers automatic updates (language, from, to,
  date) for the "Updated automatically" banner.
- The app re-checks a local file when it reads it (its hash must equal its name and the
  language's `library_preset.sha256`, and it must validate); a damaged or missing file falls
  back to the language's built-in default, and the sheet offers to download it again.

## When the app goes online

- When the user opens the preset list (adding a language, or "Browse presets" in a language's
  sheet). Nothing at startup.
- For updates: at most once a day, and only while at least one chosen, enabled language with
  **Update this preset automatically** on uses a preset (off by default). With auto-update off
  everywhere the app goes online only when the user browses.
- Every request is a plain HTTPS GET with no query string, no cookies, no identifiers and a
  fixed `User-Agent: Typelite`. Nothing about the user, their languages or their text is sent.
  GitHub sees the IP address, as with any download; the guide says so.
- The log records the URL, status, bytes and duration, as for other downloads.

## Offline

- Downloaded presets and built-in defaults work with no network, forever.
- The list shows the built-in default and the downloaded presets, with "Can't reach the preset
  library" and **Try again**. The language keeps whatever it uses.

## Considered

- **A release tag** (`v1.2.0/presets/...`): stable, but presets would reach users only with app
  releases, which defeats community contributions.
- **Pinning a commit in the app**: the same problem, and every app build would need a bump.
- **Trusting the file without a hash**: the index is fetched separately, and a partial download
  or a changed file would go unnoticed.
- **Signing the index**: GitHub's HTTPS plus review on merge is the trust boundary already; a
  signing key adds key management for little gain while presets are text shown before use.
- **GitHub API or GitHub Pages**: the API is rate-limited per IP and returns JSON wrappers;
  Pages needs a deploy step. Raw files need nothing.
- **Bundling every preset in the app**: grows with contributions, and updates would wait for
  releases. Official presets may still be embedded as defaults (open question).

# Releasing

How a maintainer cuts a Typelite release. The
[Release workflow](../.github/workflows/release.yml) builds the app on GitHub Actions and creates
a **draft** release. Nothing is public until you publish the draft by hand.

## Branches and tags

- **`main` is where work lands.** Every change reaches it through a pull request with the gate
  passing. Merge to `main` only what is meant for the next release; unfinished features stay on
  their pull-request branches until they are ready.
- **A release line is a branch `release/X.Y`**, created from `main` when `X.Y.0` is cut (or, for
  a line that was tagged on `main` before this rule, from its tag: `release/1.0` starts at
  `v1.0.0`). All `X.Y.*` releases are tagged on it. It lives as long as `X.Y` gets patches.
- **A release is an annotated tag** `vX.Y.Z` on its release branch (Semantic Versioning: a patch
  `X.Y.Z+1` for fixes, a minor `X.Y+1.0` for features, a major for breaking changes such as a
  settings format that older builds cannot read). The tag starts the Release workflow. Tags are
  never moved or reused once a release is published; before that, a failed build may be tagged
  again (see below).
- **Patches go to the release branch in one of two ways:**
  - **From `main`:** the fix is merged to `main` first, then cherry-picked onto `release/X.Y`
    (`git cherry-pick -x <commit>`, so the commit says where it came from).
  - **Hotfix straight to the release branch:** when `main` holds more than the fix, or the fix is
    urgent, open the pull request against `release/X.Y`. After it is merged, bring the same fix to
    `main` with a second pull request (cherry-pick it), so the next line has it too.
- **Every patch bumps the version and adds its What's New entry on the release branch.** The same
  What's New entry also goes to `main` (the version on `main` stays at its line's last value until
  the next minor or major is prepared), so later releases keep the whole list.
- Pull requests into `release/*` run the same CI as pull requests into `main`.

## What the workflow builds

| File | What it is |
|---|---|
| `Typelite_X.Y.Z_aarch64.dmg` | Disk image with the app, for Macs with Apple Silicon |
| `Typelite_X.Y.Z_aarch64.zip` | The same app bundle, zipped with `ditto` |
| `SHA256SUMS.txt` | SHA-256 of the DMG and the ZIP |

It runs on a `macos-14` runner (Apple Silicon). It builds `llama-server`
(`npm run build:llama-server`), then the app with the same bundle config as `npm run build:app`,
then the DMG with `scripts/build-dmg.sh`: a window with large icons, the app on the left and an
arrow to Applications on the right (`scripts/dmg-settings.py`, background
`src-tauri/icons/dmg/background.svg`). dmgbuild writes that layout itself; Tauri's own DMG step
needs Finder for it and skips it on CI. To try it locally:
`bash scripts/build-dmg.sh "$PWD/src-tauri/target/release/bundle/macos/Typelite.app" /tmp/Typelite.dmg`.
The release notes come from What's New for that version
(`node scripts/release-notes.mjs X.Y.Z`), followed by install steps.

## Cut a release

### A new line (`X.Y.0`)

1. On a short-lived branch `release/prepare-X.Y.0` from `main`: **bump the version** to `X.Y.0`
   in both places, and keep them equal:
   - `package.json` (`version`): the app's version. The UI (`APP_VERSION`) and Tauri
     (`tauri.conf.json` → `"version": "../package.json"`) read it from here.
   - `src-tauri/Cargo.toml` (`[package] version`; `cargo build` updates `Cargo.lock`). A test
     fails when it differs from `package.json`.
2. **Update What's New**: add an entry for `X.Y.0` at the top of `src/lib/whatsNew.ts`, with
   English strings in `src/i18n/locales/en.json` and Chinese strings in `zh.json`.
3. Merge it to `main` through a pull request, with the offline gate passing.
4. **Create the release branch and tag it:**

   ```sh
   git switch main && git pull
   git switch -c release/X.Y && git push -u origin release/X.Y
   git tag -a vX.Y.0 -m "Typelite X.Y.0"
   git push origin vX.Y.0
   ```

### A patch (`X.Y.Z+1`)

1. Get the fixes onto `release/X.Y`: cherry-picks from `main`, or hotfix pull requests against
   `release/X.Y` (see above).
2. On `release/X.Y` (through a pull request against it): bump the version to `X.Y.Z+1` in the
   two places and add its What's New entry. Add the same entry to `main` in a pull request.
3. **Tag the release branch:**

   ```sh
   git switch release/X.Y && git pull
   git tag -a vX.Y.Z+1 -m "Typelite X.Y.Z+1"
   git push origin vX.Y.Z+1
   ```

### Both

- The workflow stops early if the tag does not match the version in `package.json`.
- **Review the draft** under Releases: download the DMG, check it against `SHA256SUMS.txt`,
  install it on a clean account if you can, and read the notes. Then press **Publish release**.
- If the build fails (or the draft needs another fix) before it is published: cancel the run,
  delete the tag (`git push --delete origin vX.Y.Z` and `git tag -d vX.Y.Z`) and any draft it
  left, fix the release branch, then tag again.

## Updates

Installed copies update themselves from GitHub Releases (plan `auto-update`). The workflow signs
the update package with Tauri's updater key and uploads it with `latest.json`; the app reads
`https://github.com/sennett-lau/typelite/releases/latest/download/latest.json`.

- **The key.** The public key is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The
  private key is the repository secret `TAURI_SIGNING_PRIVATE_KEY` (and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty when the key has no password). The maintainer keeps a
  copy offline; without it no update can ever be signed again, and a new key means users must
  install the next version by hand once. The workflow stops when the secret is missing.
- **Publishing a patch for an older line** (for example 1.0.4 after 1.1.0): untick **Set as the
  latest release**, so `releases/latest` stays on the newest line.
- A local `npm run build:app` builds no update package; `tauri.release.conf.json`, used only by the
  workflow, turns it on.

## Dry run

Actions → **Release** → **Run workflow** builds the same files from the chosen branch (for
example `release/X.Y`) without a tag. They are attached to the workflow run as an artifact (kept for 7 days); no release is created.
Use it to check the pipeline before the first real tag.

## Checksums

The workflow runs `shasum -a 256` over the DMG and the ZIP and writes `SHA256SUMS.txt`. Users check
a download with:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

## Signing

The app is signed with the project's own certificate, **Typelite Signing**: a self-signed
code-signing certificate, not an Apple one. It exists for one reason: macOS ties a permission
grant (Accessibility, Microphone) to the app's *signer*. An ad-hoc signed build carries no
signer, only its own hash, so every build and every update silently lost the grant (System
Settings still showed it on, but the shortcuts were dead). With one certificate on every build
the grant survives updates and rebuilds.

What it does not do: Gatekeeper does not trust it, and the app is not notarised. So macOS still
blocks the first launch of a downloaded copy: users right-click the app and choose **Open** (on
macOS 15 and later: System Settings → Privacy & Security → **Open Anyway**), or run
`xattr -dr com.apple.quarantine /Applications/Typelite.app`. The release notes and the README
say so.

How it is set up:

- The certificate (a `.p12` with a random password) lives on the maintainer's Mac in
  `~/.tauri/typelite-signing/` next to the updater key, and in the repository secrets
  `APPLE_CERTIFICATE` (base64 of the `.p12`) and `APPLE_CERTIFICATE_PASSWORD`. **Back that
  folder up** with `~/.tauri/typelite-updater.key`: a new certificate means every user loses the
  grant once more, and a lost updater key means no more automatic updates for installed copies.
- The workflow imports the `.p12` into its own keychain, marks it trusted for code signing, and
  builds with `APPLE_SIGNING_IDENTITY: 'Typelite Signing'`. Tauri signs with the hardened
  runtime and `src-tauri/Entitlements.plist`, as before.
- A local `npm run build:app` or `npm run build:dev-app` signs with the same certificate when
  it is in the login keychain (`scripts/signing-identity.sh`), else ad hoc as before. The first
  signed Dev build needs one last `tccutil reset Accessibility dev.typelite.mac.dev`; after
  that, none.
- The certificate was made with `openssl req -x509 … -addext extendedKeyUsage=codeSigning` and
  exported with `openssl pkcs12 -export … -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES
  -macalg sha1` (macOS refuses OpenSSL 3's default packaging), then imported with
  `security import … -T /usr/bin/codesign` and trusted with
  `security add-trusted-cert -r trustRoot -p codeSign`. It is valid until 2036.
- Copies installed from a release signed ad hoc (1.0.0, 1.0.1) lose the grant one final time
  when they update to the first signed release; the What's New of that release must say so.

## Later: notarisation

With an Apple Developer account, the workflow can sign with a **Developer ID Application**
certificate and notarise, which removes the first-launch warning. Tauri reads these from the
environment, so the steps are:

1. Export the Developer ID certificate as a `.p12` and store it, base64-encoded, in the same two
   secrets, and change `APPLE_SIGNING_IDENTITY` to its name (for example
   `Developer ID Application: Name (TEAMID)`); the import step then needs no trust command.
2. For notarisation, add either `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and
   `APPLE_TEAM_ID`, or an App Store Connect API key (`APPLE_API_KEY`, `APPLE_API_ISSUER`,
   `APPLE_API_KEY_PATH`). Tauri then notarises and staples the app during the build.
3. Test the signed build (microphone, paste, Built-in speech and AI) and add any missing
   entitlement to `src-tauri/Entitlements.plist`. Then remove the unsigned-app steps from the
   README and the release notes.

Changing the signer loses every user's Accessibility grant once, so do it with a release whose
What's New says so.

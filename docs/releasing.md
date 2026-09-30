# Releasing

How a maintainer cuts a Typelite release. The
[Release workflow](../.github/workflows/release.yml) builds the app on GitHub Actions and creates
a **draft** release. Nothing is public until you publish the draft by hand.

## Branches and tags

Typelite uses trunk-based releases:

- **`main` is always releasable.** Every change reaches it through a pull request with the gate
  passing; there is no long-lived develop or release branch.
- **A release is an annotated tag** `vX.Y.Z` on a `main` commit (Semantic Versioning: a patch
  `X.Y.Z+1` for fixes, a minor `X.Y+1.0` for features, a major for breaking changes such as a
  settings format that older builds cannot read). The tag starts the Release workflow; tags are
  never moved or reused once a release is published.
- **Prepare a release** on a short-lived branch `release/prepare-X.Y.Z` (version bump and What's
  New), merged to `main` like any pull request, then tag the merge commit.
- **Release branches only for patches of an older line.** When `main` has moved on and `X.Y` needs
  a fix, create `release/X.Y` from the tag `vX.Y.Z`, fix on `main` first and cherry-pick the fix
  onto `release/X.Y`, bump the patch version there, and tag `vX.Y.Z+1` on that branch. Until then,
  no release branch exists.

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

1. **Bump the version** to `X.Y.Z` in all three places, and keep them equal:
   - `package.json` (`version`)
   - `src-tauri/tauri.conf.json` (`version`)
   - `src-tauri/Cargo.toml` (`[package] version`; `cargo build` updates `Cargo.lock`)
2. **Update What's New**: add an entry for `X.Y.Z` at the top of `src/lib/whatsNew.ts`, with
   English strings in `src/i18n/locales/en.json` and Chinese strings in `zh.json`.
3. Merge these changes to `main` through a pull request, with the offline gate passing.
4. **Tag and push** from an up-to-date `main`:

   ```sh
   git switch main && git pull
   git tag -a vX.Y.Z -m "Typelite X.Y.Z"
   git push origin vX.Y.Z
   ```

   The workflow stops early if the tag does not match the version in `tauri.conf.json`.
5. **Review the draft** under Releases: download the DMG, check it against `SHA256SUMS.txt`,
   install it on a clean account if you can, and read the notes. Then press **Publish release**.

If the build fails, fix it on `main`, delete the tag (`git push --delete origin vX.Y.Z` and
`git tag -d vX.Y.Z`) and any draft it left, then tag again.

## Dry run

Actions → **Release** → **Run workflow** builds the same files from the chosen branch without a
tag. They are attached to the workflow run as an artifact (kept for 7 days); no release is created.
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

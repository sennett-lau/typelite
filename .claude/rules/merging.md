# Merging pull requests

- Always merge with a merge commit: `gh pr merge <number> --merge`.
- Never squash (`--squash`) or rebase (`--rebase`) a PR.
- Never delete the branch when merging: no `--delete-branch` / `-d`, and no deleting the
  head branch afterwards unless the user asks for it.

# Release branches (docs/releasing.md)

- `main` gets only what is meant for the next release. Unfinished features stay on their
  pull-request branches.
- A fix for a released line goes to `release/X.Y`: cherry-pick it from `main` with
  `git cherry-pick -x`, or open the hotfix pull request against `release/X.Y`. A hotfix merged
  there is brought to `main` with a second pull request.
- Merge into `release/*` the same way: `gh pr merge <number> --merge`, never squash or rebase,
  never delete the branch.
- Never push a tag without being asked to release. Tags go on the release branch, never on
  `main` directly.

# Merging pull requests

- Always merge with a merge commit: `gh pr merge <number> --merge`.
- Never squash (`--squash`) or rebase (`--rebase`) a PR.
- Never delete the branch when merging: no `--delete-branch` / `-d`, and no deleting the
  head branch afterwards unless the user asks for it.

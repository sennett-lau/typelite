# Paste: native "is the target app still in front?" check

After AI polish, every dictation spent about 450 ms in the "paste" step even though typing the
text took under 10 ms. Before inserting, the pipeline checks that the app the user dictated into
is still frontmost, and on macOS each check ran an AppleScript through System Events
(`osascript`, a new process, plus a browser tab query in browsers). The paste path makes the
check twice. The check now reads `NSWorkspace.frontmostApplication` in-process. Plan
`native-target-check`.

## Provenance

| Field | Value |
|---|---|
| Report date and time zone | 2026-10-05, UTC+8 |
| Kind | Performance improvement (new isolated workload; separate from `baseline.json`) |
| PR | See the PR that adds this report |
| Previous baseline report | [2026-10-03-dictionary-work](../2026-10-03-dictionary-work/README.md) (unchanged) |
| Base | `c500389` + harness-only commit `e6906ae` (adds the example and a pure refactor) |
| Candidate | base + harness + this change |
| Harness | `src-tauri/examples/benchmark_target_check.rs`, identical on both |
| Hardware, OS and toolchain | Apple M1 Pro, 32 GiB, macOS 26.5.2, rustc 1.98.1, release profile |
| Process runs / samples | before 6 processes (3, then 3 alternating with after), after 3; 1 first call + 20 samples each |

Raw data: [samples.json](samples.json). The frontmost app during all runs was a Chromium browser
(`ai.perplexity.comet`), which is the expensive case for the AppleScript (it also asks the
browser for its tab address).

## Change and hypothesis

- **Cost and evidence:** the app log (`[Pipeline Timing]`) shows paste at 445–509 ms in every
  recent run, while "Output completed" comes 9 ms after the focus check. The log has no entries
  for the 440 ms between the AI response and the focus check. That gap is
  `target_matches` plus `restore_target` in `voice_intent::executor`. Both call
  `target_still_matches_now`, which ran `MacOsContextSource::collect` (an `osascript` that reads
  name, pid, bundle ID, window title and, in browsers, the tab host). A bare `osascript` takes
  about 200 ms here.
- **Change:** `ContextSignalSource::front_app_guard` returns only the process ID and bundle ID,
  which are all a `TargetAppGuard` compares. On macOS it reads them from
  `NSWorkspace.frontmostApplication`; other platforms keep the default (`collect`).
- **Must stay the same:** the same guard values (all 120 timed samples and 9 first calls on the
  candidate matched the AppleScript guard), and an app switch must be seen. A throwaway test
  with a main run loop (as Tauri has) and reads from a background thread saw a switch to Finder
  after 18 ms and the switch back after 30 ms. The restore loop polls for up to 200 ms.
- **Not changed:** context detection at the start of a recording still uses the full AppleScript;
  it runs in the background and needs the window title and browser host.
- **Considered:** an Accessibility query (`AXFocusedApplication`) is also synchronous, but needs
  the Accessibility grant, and the log shows it returning nothing for this browser's focused
  element; `NSWorkspace` needs no permission.

## Results

Lower is better.

| Workload / unit | Before | After | Change | Effect |
|---|---:|---:|---:|---|
| `paste/target-check` ms per check, median of process medians [p10, p90] | 283.8 [258.5, 313.2] | 0.0003 [0.0003, 0.0003] | −100% (−283.8 ms) | Confirmed |
| first call in a process, ms | 233–300 | 5.1–6.4 | −98% | AppKit setup, once per app launch |

Expected effect on a dictation: the paste step loses two checks, about 450–570 ms (two
AppleScript checks; ~200 ms each for a plain app, ~285 ms for a browser). This is inferred
from the isolated workload and the log, not measured end to end; the `[Pipeline Timing]`
paste value after the change will show it.

## Validation and limitations

- `cargo test --lib` (947 passed), `cargo fmt --check`, frontend tests, docs check. No new
  clippy warnings.
- Not measured end to end in the app; needs a real dictation run (see the PR).
- `frontmostApplication` depends on AppKit's main run loop; in Typelite it always runs. A
  process without a run loop (this benchmark) would keep the value from its first read.

## Reproduce

```sh
# before: base + harness commit
cargo build --manifest-path src-tauri/Cargo.toml --release --example benchmark_target_check
src-tauri/target/release/examples/benchmark_target_check 20
# after: this branch, same commands
```

## Baseline decision

`baseline.json` stays unchanged: this is a new isolated macOS workload, not one of the local
overhead suite's workloads.

# Remember the chosen microphone

With a microphone chosen in Settings → General, each recording start searched all audio devices
for it, about 280 ms after the key press during which nothing was recorded. Typelite now
remembers the device it found and only checks that it is still the same one.

Status: building (2026-10-06)

## Goals

- Recording starts as quickly with a chosen microphone as with the system default.
- The same fallbacks: an unplugged microphone falls back to the system default and is found
  again once plugged back in.

## Non-goals

- The first recording after launch, which still lists devices once.
- The ≈ 60 ms format query and ≈ 45 ms stream start, which every microphone needs.

## Key decisions

- **Remember by requested name, check the name on reuse.** One CoreAudio property read proves the
  device is still there and still the same; any mismatch lists the devices again.
- **No device-change listener.** The name check covers unplugging and reused ids without
  another CoreAudio callback to manage.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- Should the device also be looked up at launch, so the first recording is fast too?

# Microphone selection

Let the user pick which microphone to record from. Back to [index](index.md).

## Today

Recording always uses the system default input: `default_input_device()` in
`src-tauri/src/audio/capture.rs` (and again in `commands/misc.rs` for the mic check). There is no
setting.

## Target

- Settings → General gets a **Microphone** picker: "System default" first, then every input
  device by name, and a live level meter so the user can see the chosen mic works.
- The choice is saved by device name. "System default" follows macOS when the default changes.
- If the saved device is missing (for example a USB mic unplugged), recording falls back to the
  system default and the capsule says so once. When the device comes back it is used again.
- Optional: the capsule's right-click menu gets a quick mic switcher, like Typeless.

## Notes

- Device listing and opening use `cpal`, which the app already depends on.
- Bluetooth headsets can switch to a low-quality profile when their mic opens. The picker
  shows every device, but that is worth a hint in the UI.

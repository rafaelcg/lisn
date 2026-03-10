# Changelog

## 0.1.0-alpha.1

First public alpha release.

Highlights:

- tray-first macOS Electron app for app and window audio capture
- compact tray popover plus dashboard management UI
- SQLite-backed session history
- Markdown and plain-text transcript export
- local post-capture transcription via `whisper.cpp`
- optional OpenAI cloud refinement after capture stops

Known limitations:

- no true live transcription
- Windows capture is not stable
- OpenAI API keys are not stored in Keychain yet
- release signing and notarization are not finalized

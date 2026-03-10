# Lisn

Lisn is a macOS-first Electron app for capturing app or window audio and saving timestamped transcripts locally.

It currently ships two surfaces:

- a compact tray popover for quick capture
- a dashboard window for history, export, and settings

## Current status

Lisn is usable for local development on macOS, but it is still early-stage software.

What works today:

- app and window source selection through a native macOS helper
- post-capture audio recording
- local transcription after capture stops when `whisper.cpp` is installed
- optional OpenAI cloud transcription after capture stops
- SQLite-backed session history
- Markdown and plain-text transcript export

What does not exist yet:

- true live transcription during recording
- stable Windows capture
- Keychain-backed storage for the OpenAI API key
- polished production app signing and release assets

## Product behavior

- Browser capture is intentionally app-first. Browser tabs are not treated as reliable capture targets.
- Cloud transcription is a post-capture refinement step, not live streaming.
- The UI may refer to a "live transcript" view, but transcript segments are finalized after recording stops.
- Local transcription only works when `whisper.cpp` and the required model are installed and discoverable.

## Stack

- Electron Forge
- Vite
- React
- TypeScript
- SQLite via `better-sqlite3`
- Swift + ScreenCaptureKit helper on macOS

## Repository layout

- `src/main` Electron main process, IPC, storage, capture adapters, transcription services
- `src/renderer` tray and dashboard React UI
- `src/shared` shared types and IPC contracts
- `native/macos/LisnCaptureHelper` Swift package for macOS capture
- `scripts` helper scripts for model download and native helper builds
- `tests` storage, export, and contract tests

## Requirements

- Node.js 22+
- npm
- macOS for the working capture path
- Xcode command line tools for the Swift helper

Optional:

- `whisper.cpp` for local transcription
- an OpenAI API key for cloud refinement

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Build the macOS helper:

```bash
./scripts/build-macos-helper.sh
```

3. Download the local Whisper base model if you want offline transcription:

```bash
node ./scripts/download-whisper-model.mjs
```

4. Start the app:

```bash
npm start
```

## macOS permissions

Lisn needs Screen Recording permission for the process macOS associates with the app during development. Depending on how you launch it, that may appear as:

- `Terminal`
- `Ghostty`
- `Electron`

If capture fails, verify that permission before changing app code.

## Local transcription setup

Lisn expects `whisper.cpp` to be available through one of these paths:

- `WHISPER_CPP_BIN`
- your shell `PATH`
- a local `whisper.cpp` checkout/build path detected by the app

The default model path is:

- `models/ggml-base.bin`

If local transcription dependencies are missing, local-only mode will not produce transcript text.

## Development commands

```bash
npm start
npm run typecheck
npm test
```

Avoid running packaging builds during normal development unless you specifically need them.

## Security notes

- The OpenAI API key is currently stored in the app settings file, not the macOS Keychain.
- This repository should not be described as production-hardened yet.
- If you find a security issue, follow the process in [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome, but the project is still opinionated about product scope:

- keep the tray UI compact
- keep the dashboard as the full management surface
- verify behavior in the main process before claiming a renderer feature is real
- do not describe the app as having streaming/live transcription unless that is actually implemented

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and review expectations.

## Open source launch checklist

Before calling this production-ready, the main remaining gaps are:

- app signing/notarization and release packaging
- secret storage via Keychain
- real Windows capture support
- broader test coverage around capture/transcription flows

## License

[MIT](LICENSE)

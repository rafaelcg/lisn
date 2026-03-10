# Contributing to Lissen

## Before you start

- Read the project status in [README.md](README.md).
- Treat macOS capture as the primary supported path.
- Verify implementation details before documenting or marketing a feature.

## Development setup

1. Install dependencies with `npm install`.
2. Build the macOS helper with `./scripts/build-macos-helper.sh`.
3. Optionally download the local Whisper model with `node ./scripts/download-whisper-model.mjs`.
4. Start the app with `npm start`.

## Contribution guidelines

- Keep fixes pragmatic and runtime-focused.
- Preserve the tray/dashboard split:
  - tray is compact and fast
  - dashboard is the full management UI
- Be conservative with Electron window lifecycle changes. Tray regressions are easy to introduce.
- Do not claim live transcription unless transcript chunks are actually emitted during capture.
- Prefer small, reviewable pull requests.

## Code quality

Before opening a pull request, run:

```bash
npm run typecheck
npm test
```

Do not run packaging builds unless your change specifically needs them.

## Pull requests

Please include:

- a clear summary of what changed
- screenshots or recordings for UI changes
- notes about macOS permissions or native-helper behavior if relevant
- any known gaps or follow-up work

## Scope notes

Good contributions:

- bug fixes in capture, export, or session lifecycle
- test coverage improvements
- honest documentation improvements
- UI polish that preserves current product constraints

Changes that need extra care:

- tray shell behavior
- native capture helper behavior
- security-sensitive storage changes
- packaging/signing/release workflows

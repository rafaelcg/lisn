# Lissen Agent Notes

This file is for future agents working in this repo.

## Product summary

Lissen is a macOS-first Electron transcription app with:

- a compact tray popover for quick capture
- a dashboard window for transcript history, export, and settings

The app captures app/window audio, stores session history in SQLite, and produces timestamped transcripts after recording stops.

## What is real right now

- Tray popover and dashboard window both exist and are selected by renderer mode
- Source enumeration works through the macOS helper
- macOS capture start/stop returns an audio file path
- SQLite session persistence and transcript export work
- OpenAI cloud transcription works after stop when an API key is configured
- Browser capture is intentionally app-first in the source selector

## What is not real yet

- True live transcription during capture
- Stable Windows capture
- Keychain-backed secret storage for the OpenAI key
- Polished tray icon asset

Do not describe the app as having real-time transcript streaming unless that is actually implemented.

## Important UX/product decisions already made

- Browser tabs are not treated as reliable capture targets. Prefer browser app entries like `Brave Browser` over individual browser windows/tabs.
- The source list intentionally filters noisy system surfaces such as Control Center, Dock, and menu-bar junk.
- Cloud transcription is post-capture refinement/finalization, not concurrent transcription while recording.
- The tray popover is intentionally compact; the dashboard is the full management surface.

## Files to inspect first

- [src/main/main.ts](/Users/rafael/Projects/lissen/src/main/main.ts)
  Main Electron lifecycle, tray, popover, dashboard.

- [src/renderer/App.tsx](/Users/rafael/Projects/lissen/src/renderer/App.tsx)
  Both tray and dashboard UI modes live here.

- [src/main/session-manager.ts](/Users/rafael/Projects/lissen/src/main/session-manager.ts)
  Session lifecycle, source caching, stop/finalize flow, event emission.

- [src/main/transcription/whisper-provider.ts](/Users/rafael/Projects/lissen/src/main/transcription/whisper-provider.ts)
  Local and cloud transcription behavior.

- [native/macos/LissenCaptureHelper/Sources/LissenCaptureHelper/main.swift](/Users/rafael/Projects/lissen/native/macos/LissenCaptureHelper/Sources/LissenCaptureHelper/main.swift)
  ScreenCaptureKit helper.

## Current renderer mode split

The renderer decides its surface from `window.location.search`:

- `?mode=tray`
- `?mode=dashboard`

Tray/dashboard styling differences rely on document `data-window-mode` attributes set in the renderer.

## Current transcription behavior

- `startSession()` starts audio capture only
- `stopSession()` performs transcription
- local draft transcription is file-based and happens after stop
- cloud transcription is file-based and happens after stop
- segment events are emitted after finalization, not continuously during recording

That means any "live transcript" label in the UI is only a preview of the latest finalized/current session data, not a true streaming transcript.

## Local transcription assumptions

Local transcription depends on:

- `whisper.cpp` CLI
- `models/ggml-base.bin`

If local Whisper is unavailable, local-only mode will not produce text. Check runtime status before assuming a bug in the UI.

## macOS development caveats

- Screen Recording permission may attach to `Terminal`, `Ghostty`, or `Electron` depending on how the app is launched in development.
- The tray shell has been a frequent source of regressions. If tray behavior breaks, inspect window destruction/recreation logic before changing UI code.
- The native helper has already required multiple availability/concurrency fixes; be careful with ScreenCaptureKit and Swift actor boundaries.

## Working style for this repo

- Prefer fixing runtime behavior over cosmetic abstraction.
- Verify whether a thing is actually implemented before telling the user it exists.
- Keep the tray UI compact and the dashboard UI full-featured.
- Be conservative with Electron window lifecycle changes. Small shell changes have broken launch/quit behavior before.

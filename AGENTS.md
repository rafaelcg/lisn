# Lissen Agent Notes

This file is for future agents working in this repository.

## Product summary

Lissen is a macOS-first Electron transcription app with:

- a compact tray popover for quick capture
- a dashboard window for transcript history, export, and settings

The app captures app and window audio, stores session history in SQLite, and produces timestamped transcripts after recording stops.

## What is real right now

- tray popover and dashboard window both exist and are selected by renderer mode
- source enumeration works through the macOS helper
- macOS capture start and stop returns an audio file path
- SQLite session persistence and transcript export work
- OpenAI cloud transcription works after stop when an API key is configured
- browser capture is intentionally app-first in the source selector

## What is not real yet

- true live transcription during capture
- stable Windows capture
- Keychain-backed secret storage for the OpenAI key
- polished tray icon and release packaging

Do not describe the app as having real-time transcript streaming unless that is actually implemented.

## Important product decisions

- Browser tabs are not treated as reliable capture targets. Prefer browser app entries over individual tabs or windows.
- The source list intentionally filters noisy system surfaces such as Control Center, Dock, and menu bar surfaces.
- Cloud transcription is post-capture refinement, not concurrent transcription while recording.
- The tray popover is intentionally compact. The dashboard is the full management surface.

## Inspect first

- `src/main/main.ts`
- `src/renderer/App.tsx`
- `src/main/session-manager.ts`
- `src/main/transcription/whisper-provider.ts`
- `native/macos/LissenCaptureHelper/Sources/LissenCaptureHelper/main.swift`

## Renderer mode split

The renderer decides its surface from `window.location.search`:

- `?mode=tray`
- `?mode=dashboard`

Tray and dashboard styling differences rely on document `data-window-mode` attributes set in the renderer.

## Current transcription behavior

- `startSession()` starts audio capture only
- `stopSession()` performs transcription
- local draft transcription is file-based and happens after stop
- cloud transcription is file-based and happens after stop
- segment events are emitted after finalization, not continuously during recording

That means any "live transcript" label in the UI is only a preview of the latest finalized session data, not true streaming output.

## Local transcription assumptions

Local transcription depends on:

- `whisper.cpp` CLI
- `models/ggml-base.bin`

If local Whisper is unavailable, local-only mode will not produce text.

## macOS caveats

- Screen Recording permission may attach to `Terminal`, `Ghostty`, or `Electron` depending on how the app is launched in development.
- The tray shell has been a frequent source of regressions. If tray behavior breaks, inspect window destruction and recreation logic before changing UI code.
- The native helper has already required availability and concurrency fixes; be careful with ScreenCaptureKit and Swift actor boundaries.

## Working style

- Prefer fixing runtime behavior over cosmetic abstraction.
- Verify whether a thing is actually implemented before saying it exists.
- Keep the tray UI compact and the dashboard UI full-featured.
- Be conservative with Electron window lifecycle changes.

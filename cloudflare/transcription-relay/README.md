# Lisn Transcription Relay

Cloudflare Worker that accepts uploaded audio from the desktop app and forwards it to OpenAI Whisper using a server-side secret.

## Live URL

`https://lisn-transcription-relay.rafaelcg-a0a.workers.dev`

## Required secret

Set the Worker secret before using the relay in production:

```bash
npx wrangler secret put OPENAI_API_KEY --config cloudflare/transcription-relay/wrangler.toml
```

## Deploy

```bash
npm run relay:deploy
```

## Local development

```bash
npm run relay:dev
```

## Endpoints

- `GET /health`
- `POST /v1/transcriptions`

`POST /v1/transcriptions` expects multipart form data with:

- `file`
- optional `model` (currently ignored in favor of `whisper-1`)

export interface Env {
  OPENAI_API_KEY: string;
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers
    }
  });
}

function badRequest(message: string, status = 400) {
  return json({ error: message }, { status });
}

async function handleTranscription(request: Request, env: Env): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return badRequest("Worker secret OPENAI_API_KEY is missing.", 500);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest("Expected multipart form field `file`.");
  }

  if (file.size === 0) {
    return badRequest("Uploaded audio file is empty.");
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return badRequest("Uploaded audio file exceeds the 25 MB limit.", 413);
  }

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "audio.m4a");
  upstreamForm.append("model", "whisper-1");
  upstreamForm.append("response_format", "verbose_json");
  upstreamForm.append("timestamp_granularities[]", "segment");

  const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: upstreamForm
  });

  const payload = await upstream.text();
  if (!upstream.ok) {
    return new Response(payload, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
      }
    });
  }

  return new Response(payload, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "lisn-transcription-relay" });
    }

    if (request.method === "POST" && url.pathname === "/v1/transcriptions") {
      return handleTranscription(request, env);
    }

    return badRequest("Not found.", 404);
  }
};

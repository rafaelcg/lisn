import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhisperProvider } from "../src/main/transcription/whisper-provider";

const originalFetch = globalThis.fetch;

describe("WhisperProvider", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("falls back to a single transcript segment when the cloud response only returns text", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "lisn-whisper-provider-"));
    const audioPath = join(workDir, "sample.m4a");
    await writeFile(audioPath, "fake audio");

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: "Hello from the relay." }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as typeof fetch;

    const provider = new WhisperProvider(workDir);
    const result = await provider.refineWithCloud(
      "session-123",
      audioPath,
      "https://lisn-transcription-relay.example.com"
    );

    expect(result.engine).toBe("openai:whisper-1");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      sessionId: "session-123",
      startMs: 0,
      endMs: 0,
      text: "Hello from the relay.",
      source: "cloud"
    });
  });
});

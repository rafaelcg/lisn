import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import OpenAI from "openai";
import type { RuntimeStatus, TranscriptSegment } from "@shared/types";
import type { FinalizedTranscription, TranscriptionProvider } from "./types";

function normalizeSegments(
  sessionId: string,
  source: "local" | "cloud",
  segments: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number }>
): TranscriptSegment[] {
  return segments
    .filter((segment) => segment.text?.trim())
    .map((segment) => ({
      id: randomUUID(),
      sessionId,
      startMs: Math.max(0, Math.round((segment.start ?? 0) * 1000)),
      endMs: Math.max(0, Math.round((segment.end ?? segment.start ?? 0) * 1000)),
      text: segment.text!.trim(),
      confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : null,
      source
    }));
}

export class WhisperProvider implements TranscriptionProvider {
  constructor(private readonly modelsDirectory: string) {}

  async getRuntimeStatus(apiKey: string): Promise<RuntimeStatus> {
    const modelPath = join(this.modelsDirectory, "ggml-base.bin");
    try {
      await access(modelPath);
      await this.resolveWhisperCli();
      return {
        localTranscriptionAvailable: true,
        localTranscriptionReason: "whisper.cpp is ready.",
        cloudTranscriptionConfigured: Boolean(apiKey)
      };
    } catch (error) {
      return {
        localTranscriptionAvailable: false,
        localTranscriptionReason: "Local Whisper is unavailable. Install whisper.cpp CLI and the base model to use local-only mode.",
        cloudTranscriptionConfigured: Boolean(apiKey)
      };
    }
  }

  async transcribeDraft(sessionId: string, audioPath: string): Promise<FinalizedTranscription> {
    const modelPath = join(this.modelsDirectory, "ggml-base.bin");
    try {
      await access(modelPath);
      await access(audioPath);
      const whisperBin = await this.resolveWhisperCli();
      const outputDir = await mkdtemp(join(tmpdir(), "lissen-whisper-"));
      const outputBase = join(outputDir, "transcript");

      await new Promise<void>((resolve, reject) => {
        execFile(
          whisperBin,
          [
            "-m",
            modelPath,
            "-f",
            audioPath,
            "-oj",
            "-of",
            outputBase,
            "--language",
            "auto"
          ],
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          }
        );
      });

      const raw = JSON.parse(await readFile(`${outputBase}.json`, "utf8")) as {
        transcription?: Array<{ offset_timestamps?: { from?: number; to?: number }; text?: string }>;
      };

      await rm(outputDir, { recursive: true, force: true });
      const segments = (raw.transcription ?? [])
        .filter((segment) => segment.text?.trim())
        .map((segment) => ({
          id: randomUUID(),
          sessionId,
          startMs: segment.offset_timestamps?.from ?? 0,
          endMs: segment.offset_timestamps?.to ?? segment.offset_timestamps?.from ?? 0,
          text: segment.text!.trim(),
          confidence: null,
          source: "local" as const
        }));

      return {
        engine: "whisper.cpp:base",
        segments
      };
    } catch (error) {
      return {
        engine: "whisper.cpp:unavailable",
        segments: []
      };
    }
  }

  async refineWithCloud(sessionId: string, audioPath: string, apiKey: string): Promise<FinalizedTranscription> {
    const client = new OpenAI({ apiKey });
    const response = await client.audio.transcriptions.create({
      file: await OpenAI.toFile(await readFile(audioPath), audioPath.split("/").pop() ?? "audio.m4a"),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"]
    });

    return {
      engine: "openai:whisper-1",
      segments: "segments" in response && Array.isArray(response.segments)
        ? normalizeSegments(sessionId, "cloud", response.segments)
        : []
    };
  }

  private async resolveWhisperCli(): Promise<string> {
    const candidates = [
      process.env.WHISPER_CPP_BIN,
      join(dirname(this.modelsDirectory), "whisper.cpp", "build", "bin", "whisper-cli"),
      join(process.cwd(), "whisper.cpp", "build", "bin", "whisper-cli"),
      "whisper-cli"
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(candidate, ["--help"], (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
        return candidate;
      } catch {
        continue;
      }
    }

    throw new Error("whisper.cpp CLI not found");
  }
}

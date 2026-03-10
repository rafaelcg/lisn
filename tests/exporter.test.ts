import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportTranscript } from "../src/main/storage/exporter";
import type { SessionWithSegments } from "../src/shared/types";

describe("exportTranscript", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lissen-export-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes timestamped markdown output", () => {
    const session: SessionWithSegments = {
      id: "session-1",
      sourceId: "source-1",
      sourceName: "Slack Huddle",
      sourceKind: "application",
      sourceAppName: "Slack",
      status: "completed",
      startedAt: "2026-03-09T21:00:00.000Z",
      endedAt: "2026-03-09T21:10:00.000Z",
      engine: "whisper.cpp:base",
      usedCloudRefinement: false,
      audioPath: null,
      exportPath: null,
      errorMessage: null,
      segments: [
        {
          id: "seg-1",
          sessionId: "session-1",
          startMs: 0,
          endMs: 4_500,
          text: "First segment",
          source: "local",
          confidence: 0.9
        }
      ]
    };

    const filePath = exportTranscript(session, "markdown", tempDir);
    const contents = readFileSync(filePath, "utf8");

    expect(contents).toContain("# Slack Huddle");
    expect(contents).toContain("[00:00:00 - 00:00:04] First segment");
  });
});

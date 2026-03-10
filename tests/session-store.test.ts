import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/main/storage/session-store";
import type { SessionRecord, TranscriptSegment } from "../src/shared/types";

describe("SessionStore", () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lissen-store-"));
    store = new SessionStore(join(tempDir, "lissen.sqlite"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists sessions and segments", () => {
    const session: SessionRecord = {
      id: "session-1",
      sourceId: "source-1",
      sourceName: "Safari",
      sourceKind: "window",
      sourceAppName: "Safari",
      status: "capturing",
      startedAt: "2026-03-09T21:00:00.000Z",
      endedAt: null,
      engine: "whisper.cpp:base",
      usedCloudRefinement: true,
      audioPath: "/tmp/session-1.wav",
      exportPath: null,
      errorMessage: null
    };

    const segments: TranscriptSegment[] = [
      {
        id: "seg-1",
        sessionId: "session-1",
        startMs: 0,
        endMs: 2_500,
        text: "Segment one",
        source: "local",
        confidence: 0.82
      }
    ];

    store.createSession(session);
    store.replaceSegments(session.id, segments);
    store.updateSession(session.id, {
      status: "completed",
      endedAt: "2026-03-09T21:10:00.000Z"
    });

    const loaded = store.getSession(session.id);

    expect(loaded?.usedCloudRefinement).toBe(true);
    expect(loaded?.status).toBe("completed");
    expect(loaded?.segments).toHaveLength(1);
    expect(store.listSessions()).toHaveLength(1);
  });
});

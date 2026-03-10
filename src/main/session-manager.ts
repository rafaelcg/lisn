import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { AppSettings, CaptureSource, ExportFormat, SessionEvent, SessionRecord, SessionWithSegments, TranscriptSegment } from "@shared/types";
import type { CaptureAdapter } from "./capture/types";
import { exportTranscript } from "./storage/exporter";
import { SessionStore } from "./storage/session-store";
import { SettingsStore } from "./storage/settings-store";
import type { TranscriptionProvider } from "./transcription/types";

interface ActiveSession {
  source: CaptureSource;
  useCloudRefinement: boolean;
  saveAudio: boolean;
  audioPath: string;
  unsubscribe: () => void;
}

export class SessionManager {
  private readonly emitter = new EventEmitter();
  private readonly activeSessions = new Map<string, ActiveSession>();
  private lastListedSources = new Map<string, CaptureSource>();

  constructor(
    private readonly captureAdapter: CaptureAdapter,
    private readonly sessionStore: SessionStore,
    private readonly settingsStore: SettingsStore,
    private readonly transcriptionProvider: TranscriptionProvider
  ) {}

  async listSources() {
    try {
      const sources = await this.captureAdapter.listSources();
      this.lastListedSources = new Map(sources.map((source) => [source.id, source]));
      console.log("[Lisn session manager] listSources ok", sources.length);
      return sources;
    } catch (error) {
      console.error("[Lisn session manager] listSources failed", error);
      throw error;
    }
  }

  getSessions() {
    return this.sessionStore.listSessions();
  }

  getSession(sessionId: string) {
    return this.sessionStore.getSession(sessionId);
  }

  getSettings(): AppSettings {
    return this.settingsStore.get();
  }

  async getRuntimeStatus() {
    const settings = this.settingsStore.get();
    return this.transcriptionProvider.getRuntimeStatus(settings.transcriptionRelayUrl);
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    return this.settingsStore.update(partial);
  }

  async startSession(input: { sourceId: string; useCloudRefinement: boolean; saveAudio: boolean }): Promise<SessionRecord> {
    const settings = this.settingsStore.get();
    if (!settings.transcriptionRelayUrl) {
      throw new Error("Lisn cloud transcription relay is not configured for this build.");
    }

    let source = this.lastListedSources.get(input.sourceId);
    const requestedSource = source;
    if (!source) {
      const freshSources = await this.listSources();
      source = freshSources.find((candidate) => candidate.id === input.sourceId);
    }

    if (!source && requestedSource?.kind === "window" && typeof requestedSource.processId === "number") {
      source = [...this.lastListedSources.values()].find(
        (candidate) => candidate.kind === "application" && candidate.processId === requestedSource.processId
      );
    }

    if (!source) {
      throw new Error(`Unknown source: ${input.sourceId}`);
    }

    const sessionId = randomUUID();
    mkdirSync(join(app.getPath("temp"), ".lisn-temp"), { recursive: true });
    const startedAt = new Date().toISOString();
    const captureSession = await this.captureAdapter.startSession(sessionId, source.id);
    const unsubscribe = this.captureAdapter.onSessionEvent(sessionId, (event) => this.emit(event));
    const shouldUseCloudRefinement = true;

    const record: SessionRecord = {
      id: sessionId,
      sourceId: source.id,
      sourceName: source.name,
      sourceKind: source.kind,
      sourceAppName: source.appName ?? null,
      status: "capturing",
      startedAt,
      endedAt: null,
      engine: "openai:whisper-1",
      usedCloudRefinement: shouldUseCloudRefinement,
      audioPath: input.saveAudio ? captureSession.audioPath : null,
      exportPath: null,
      errorMessage: null
    };

    this.sessionStore.createSession(record);
    this.activeSessions.set(sessionId, {
      source,
      useCloudRefinement: shouldUseCloudRefinement,
      saveAudio: input.saveAudio,
      audioPath: captureSession.audioPath,
      unsubscribe
    });

    this.emit({
      sessionId,
      type: "status",
      status: "capturing",
      message: `Capturing ${source.name}. Cloud transcription will run after stop.`
    });

    return record;
  }

  async stopSession(sessionId: string): Promise<SessionWithSegments> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      const existing = this.sessionStore.getSession(sessionId);
      if (!existing) {
        throw new Error(`Unknown session ${sessionId}`);
      }
      return existing;
    }

    this.sessionStore.updateSession(sessionId, {
      status: "finalizing"
    });
    this.emit({ sessionId, type: "status", status: "finalizing", message: "Finalizing transcript" });

    const stopResult = await this.captureAdapter.stopSession(sessionId);
    activeSession.unsubscribe();
    const settings = this.settingsStore.get();
    if (!settings.transcriptionRelayUrl) {
      throw new Error("Lisn cloud transcription relay is not configured for this build.");
    }

    let segments: TranscriptSegment[] = [];
    let engine = "openai:whisper-1";

    try {
      const cloud = await this.transcriptionProvider.refineWithCloud(sessionId, stopResult.audioPath, settings.transcriptionRelayUrl);
      segments = cloud.segments;
      engine = cloud.engine;
      console.log("[Lisn session manager] cloud transcription ok", { sessionId, segments: cloud.segments.length });
    } catch (error) {
      console.error("[Lisn session manager] cloud transcription failed", error);
      this.emit({
        sessionId,
        type: "error",
        message: error instanceof Error ? error.message : "Cloud transcription failed"
      });
    }

    this.sessionStore.replaceSegments(sessionId, segments);
    this.sessionStore.updateSession(sessionId, {
      status: "completed",
      endedAt: new Date().toISOString(),
      engine,
      audioPath: activeSession.saveAudio ? stopResult.audioPath : null,
      errorMessage: segments.length ? null : "No transcription backend produced text for this session."
    });

    if (!activeSession.saveAudio) {
      rmSync(stopResult.audioPath, { force: true });
    }

    this.activeSessions.delete(sessionId);
    const completed = this.sessionStore.getSession(sessionId);
    if (!completed) {
      throw new Error(`Session ${sessionId} disappeared after finalization`);
    }

    for (const segment of completed.segments) {
      this.emit({ sessionId, type: "segment", segment });
    }
    if (!completed.segments.length) {
      this.emit({
        sessionId,
        type: "error",
        message: completed.errorMessage ?? "Transcript capture finished without text."
      });
    }
    this.emit({ sessionId, type: "status", status: "completed", message: "Transcript saved" });
    return completed;
  }

  exportSession(sessionId: string, format: ExportFormat): string {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const filePath = exportTranscript(session, format, this.settingsStore.get().transcriptDirectory);
    this.sessionStore.updateSession(sessionId, {
      exportPath: filePath
    });
    return filePath;
  }

  subscribeSessionEvents(sessionId: string, callback: (event: SessionEvent) => void) {
    this.emitter.on(sessionId, callback);
    return () => this.emitter.off(sessionId, callback);
  }

  private emit(event: SessionEvent) {
    this.emitter.emit(event.sessionId, event);
  }
}
